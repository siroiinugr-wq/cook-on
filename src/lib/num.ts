// 数字の入力欄：全角（日本語入力のまま打った「１２．５」）も半角に直してから、数字と小数点だけを残す。
// 以前は全角の文字をそのまま消していたので、日本語入力がオンだと何も入らなかった
export const numText = (v: string): string => v.normalize("NFKC").replace(/[。．]/g, ".").replace(/[^\d.]/g, "");
