export function split_space(s: string): [string, string] {
    return s.split(/\s+(.*)/);
}