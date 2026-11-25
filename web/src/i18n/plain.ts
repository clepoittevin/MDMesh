// deploy-0.5.1 only: 0.5.1 has no react-intl, and the enrollment QR changes (MDMesh-app/MDMesh#272) are written with
// it. This stands in for the few react-intl calls they make, in English: defineMessage(s) give back the descriptors,
// and formatMessage fills `{name}` and `{count, plural, one {…} other {…}}` (with `#`). Drop it once on a release with
// react-intl.

export interface MessageDescriptor {
  id?: string;
  defaultMessage?: string;
}

type Values = Record<string, string | number>;

export function defineMessage<_V = Values>(m: MessageDescriptor): MessageDescriptor {
  return m;
}

export function defineMessages<T extends Record<string, MessageDescriptor>>(m: T): T {
  return m;
}

/** Fills a message: plural blocks first (one/other, `#` = the count), then `{name}` placeholders. */
export function format(message: string, values: Values = {}): string {
  let out = '';
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf('{', i);
    if (open < 0) {
      out += message.slice(i);
      break;
    }
    out += message.slice(i, open);
    // Find the matching close brace.
    let depth = 0;
    let end = open;
    for (; end < message.length; end++) {
      if (message[end] === '{') depth++;
      else if (message[end] === '}' && --depth === 0) break;
    }
    const body = message.slice(open + 1, end);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,(.*)$/s.exec(body);
    if (plural) {
      const n = Number(values[plural[1]] ?? 0);
      const forms: Record<string, string> = {};
      const re = /(\w+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(plural[2]))) forms[m[1]] = m[2];
      const form = (n === 1 ? forms.one : undefined) ?? forms.other ?? '';
      out += format(form.replace(/#/g, String(n)), values);
    } else {
      const v = values[body.trim()];
      out += v == null ? `{${body}}` : String(v);
    }
    i = end + 1;
  }
  return out;
}

export function useIntl() {
  return {
    formatMessage: (m: MessageDescriptor, values?: Values) => format(m.defaultMessage ?? '', values),
  };
}
