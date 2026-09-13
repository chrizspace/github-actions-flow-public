const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(value) {
  const normalized = value.trim();
  const match = VERSION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`Invalid version "${normalized}"; expected MAJOR.MINOR.PATCH`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function bumpVersion(value, level) {
  const version = parseVersion(value);

  if (level === "patch") {
    version.patch += 1;
  } else if (level === "minor") {
    version.minor += 1;
    version.patch = 0;
  } else if (level === "major") {
    version.major += 1;
    version.minor = 0;
    version.patch = 0;
  } else {
    throw new Error(`Unsupported bump level "${level}"`);
  }

  return formatVersion(version);
}

export function rcVersion(value, number = 1) {
  const version = formatVersion(parseVersion(value));

  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error("RC number must be a positive integer");
  }

  return `${version}-rc.${number}`;
}
