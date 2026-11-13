(function (root) {
  'use strict';

  // Only accept timestamps that state their time zone. A date alone is not a deadline.
  function validDueAt(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/i);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] || 0);
    const millisecond = Number((match[7] || '').padEnd(3, '0').slice(0, 3));
    const offsetHour = Number(match[10] || 0), offsetMinute = Number(match[11] || 0);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;
    const offset = (match[9] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute) * 60000;
    const local = new Date(timestamp + offset);
    if (local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second || local.getUTCMilliseconds() !== millisecond) return null;
    return timestamp;
  }

  function escapeText(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function utcDate(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  }

  // RFC 5545 limits each physical content line to 75 octets, including the
  // continuation space. Iterate code points so UTF-8 characters stay intact.
  function foldLine(value) {
    const lines = [];
    let line = '', length = 0;
    for (const character of String(value)) {
      const point = character.codePointAt(0);
      const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (length + size > 75) {
        lines.push(line);
        line = ' ';
        length = 1;
      }
      line += character;
      length += size;
    }
    lines.push(line);
    return lines.join('\r\n');
  }

  function taskUrl(value) {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return '';
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function calendarUid(id) {
    // Encoding the source task ID keeps reminders stable across re-downloads
    // and across the old and new hub origins.
    const cleaned = String(id).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
    return 'moodle-' + encodeURIComponent(cleaned) + '@personal-study-hub';
  }

  function buildCalendar(tasks, options = {}) {
    const now = new Date(options.now ?? Date.now()).getTime();
    const stamp = new Date(options.stamp ?? Date.now()).getTime();
    if (!Number.isFinite(now) || !Number.isFinite(stamp)) throw new Error('Calendar timestamps must be valid.');
    const processed = new Set(Array.from(options.processedIds || [], id => String(id)));
    const courses = Array.isArray(options.courses) ? options.courses : [];
    const seen = new Set();
    const eligible = (Array.isArray(tasks) ? tasks : []).filter(task => {
      if (!task || task.id === undefined || task.id === null || !String(task.id).trim()) return false;
      const id = String(task.id), deadline = validDueAt(task.dueAt);
      if (deadline === null || deadline <= now || processed.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a, b) => validDueAt(a.dueAt) - validDueAt(b.dueAt) || String(a.id).localeCompare(String(b.id)));
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Personal Study Hub//Moodle Deadline Reminders//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeText(options.name || 'Moodle 截止提醒'),
      'X-WR-TIMEZONE:Europe/Berlin'
    ];
    for (const task of eligible) {
      const deadline = validDueAt(task.dueAt);
      const course = task.courseId === undefined || task.courseId === null ? null : courses.find(item => item && item.id !== undefined && String(item.id) === String(task.courseId));
      const title = String(task.title || 'Moodle 任务');
      const description = [];
      if (course?.title) description.push('课程：' + course.title);
      else if (task.courseId !== undefined && task.courseId !== null && String(task.courseId)) description.push('课程 ID：' + task.courseId);
      if (task.note) description.push(String(task.note));
      if (task.optional) description.push('可选任务');
      if (task.dueEstimated) description.push('预计截止，请以课程提交系统最终时间为准。');
      const sourceUrl = taskUrl(task.sourceUrl);
      if (sourceUrl) {
        const reference = new URL(sourceUrl);
        const containsCredential = reference.username || reference.password || Array.from(reference.searchParams.keys()).some(key => /token|sesskey|password|secret|authorization|api[_-]?key|^auth$/i.test(key));
        if (!containsCredential) description.push('规则来源：' + sourceUrl);
      }
      const url = taskUrl(task.url);
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + calendarUid(task.id),
        'DTSTAMP:' + utcDate(stamp),
        'DTSTART:' + utcDate(deadline),
        'DTEND:' + utcDate(deadline + 60000),
        'SUMMARY:' + escapeText((task.optional ? '【可选】' : '') + (task.dueEstimated ? '【预计】' : '') + title),
        'DESCRIPTION:' + escapeText(description.join('\n'))
      );
      if (url) lines.push('URL:' + url);
      for (const trigger of ['-P1D', '-PT2H']) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:' + trigger, 'DESCRIPTION:' + escapeText(title), 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  function formatBerlinDue(value) {
    const timestamp = validDueAt(value);
    if (timestamp === null) return '截止时间待确认';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(timestamp));
  }

  root.MOODLE_TASKS = Object.freeze({ buildCalendar, validDueAt, formatBerlinDue });
})(typeof window === 'undefined' ? globalThis : window);
