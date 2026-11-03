// 材料の名前からアレルゲンを推定する（共有の材料に結びつかなかった材料のため）。
// 取り込みで作った材料と、「データの整理」画面の「アレルゲンの確認」が使う。
// 推定は「多めに付く」向き。最後はお店が確かめて確定する（材料の allergensConfirmed）。
import { sortAllergens, type AllergenId } from "./allergens";

/** 成分表の名前の分類の見出し：＜…＞ と「（…類）」 */
export const CATEGORY_LABEL = /＜[^＞]*＞|<[^>]*>|[（(][^）)]*類[）)]/g;

// 先に外す言葉（「ココナッツミルク」は乳ではない、など）。名前からこの言葉を消してから下の表で探す
const NOT: RegExp[] = [
  /ココナッツミルク|ココナツミルク|アーモンドミルク|オーツミルク|ライスミルク|ソイミルク/g,
  /ピーナッツバター|アーモンドバター|カシューバター|カカオバター|ココアバター|シアバター/g,
  /小麦でん粉不使用|乳不使用|卵不使用|グルテンフリー/g,
  // 成分表の分類の見出し（「＜えび・かに類＞ （えび類） あまえび」の「かに」、「＜いか・たこ類＞ まだこ」の「いか」で誤って付いた）
  CATEGORY_LABEL,
];

const RULES: { id: AllergenId; re: RegExp; not?: RegExp }[] = [
  { id: "egg", re: /卵|たまご|タマゴ|玉子|鶏卵|メレンゲ|マヨネーズ|カスタード|エッグ/ },
  {
    id: "milk",
    re: /乳|バター|ミルク|クリーム(?!オブターター)|チーズ|ヨーグルト|マスカルポーネ|リコッタ|ホエイ|カゼイン|(?:^|[^ル])ギー|練乳|コンデンス|ホワイトチョコ|ミルクチョコ|生クリ|サワークリーム|クレーム|フロマージュ|ガナッシュ/,
    // 豆乳・乳酸・乳化剤は乳ではない（乳化剤は大豆のことが多いが、名前だけでは決めない）
    not: /豆乳|乳酸|乳化/g,
  },
  {
    id: "wheat",
    re: /小麦|薄力|強力|中力|準強力|全粒粉|グラハム|ライ麦粉と小麦|パン粉|フランス粉|麩|ふすま|うどん|パスタ|マカロニ|スパゲッティ|そうめん|クッキー生地|ビスケット|クラッカー|カステラ|パイ生地|フィユタージュ|スポンジ|クランブル|グルテン|セモリナ|デュラム|リスドォル|カメリヤ|ドルチェ|バイオレット|エクリチュール|春よ恋|はるゆたか|キタノカオリ|ゆめちから/,
  },
  { id: "buckwheat", re: /そば|蕎麦|ソバ粉/ },
  { id: "peanut", re: /落花生|ピーナッツ|ピーナツ|らっかせい/ },
  { id: "walnut", re: /くるみ|クルミ|胡桃|ウォールナッツ/ },
  { id: "almond", re: /アーモンド|マジパン|プラリネ|ローマジパン/ },
  { id: "cashew", re: /カシュー/ },
  { id: "macadamia", re: /マカダミア|マカデミア/ },
  { id: "sesame", re: /ごま|ゴマ|胡麻|セサミ|タヒニ/ },
  { id: "soy", re: /大豆|だいず|豆乳|豆腐|とうふ|きな粉|きなこ|黄粉|おから|味噌|みそ|醤油|しょうゆ|納豆|湯葉|ゆば|ソイ|大豆レシチン|レシチン（大豆）/ },
  { id: "orange", re: /オレンジ|ネーブル|グランマルニエ|コアントロー|ブラッドオレンジ/ },
  { id: "kiwi", re: /キウイ/ },
  { id: "banana", re: /バナナ/ },
  { id: "apple", re: /りんご|リンゴ|林檎|アップル|カルヴァドス|カルバドス|紅玉|ふじ（りんご）/ },
  { id: "peach", re: /もも(?!肉)|白桃|黄桃|ピーチ|ペッシュ|(?<!す)桃/ },
  { id: "gelatin", re: /ゼラチン|リーフゼラチン|コラーゲン/ },
  { id: "yam", re: /山芋|やまいも|長芋|ながいも|大和芋|やまといも|自然薯|じねんじょ|つくね芋/ },
  { id: "beef", re: /牛肉|ビーフ|牛脂|ヘット/ },
  { id: "pork", re: /豚|ポーク|ラード|ベーコン|ハム(?!スター)|生ハム|ソーセージ|ウインナー|チョリソ/ },
  { id: "chicken", re: /鶏肉|鶏ガラ|チキン|ささみ|とりにく/ },
  { id: "shrimp", re: /えび|エビ|海老|桜えび|シュリンプ/ },
  { id: "crab", re: /かに|カニ|蟹|がに|ガニ/ },
  { id: "squid", re: /いか|イカ|烏賊/ },
  { id: "salmonroe", re: /いくら|イクラ|すじこ|筋子/ },
  { id: "salmon", re: /鮭|さけ|サーモン|サケ/ },
  { id: "mackerel", re: /さば|サバ|鯖/ },
  { id: "abalone", re: /あわび|アワビ|鮑/ },
];

// お店で作る生地・クリーム（中身が決まっているもの）。自家製の材料はレシピに結ぶと、レシピのアレルゲンがそのまま入る（shared/madeFrom.ts）
const COMPOUNDS: { re: RegExp; ids: AllergenId[] }[] = [
  { re: /タルト生地|タルト台|タルトケース|シュクレ|サブレ生地|パートブリゼ|ブリゼ|パイ生地|フィユタージュ|クッキー生地|ビスキュイ|ジェノワーズ|スポンジ|シュー生地|パータシュー/, ids: ["wheat", "egg", "milk"] },
  { re: /クレームダマンド|クレーム・ダマンド|アーモンドクリーム|フランジパーヌ/, ids: ["almond", "egg", "milk"] },
  { re: /カスタード|クレームパティシエール|ディプロマット|クレームムースリーヌ/, ids: ["egg", "milk"] },
  { re: /クランブル|シュトロイゼル|ボトム/, ids: ["wheat", "milk"] },
  { re: /ミックスナッツ|ナッツミックス/, ids: ["almond", "cashew", "walnut", "macadamia", "peanut"] },
];

// 中身がいろいろある既製品（袋の裏の表示で確かめてもらう）
const PACKAGED = /ドレッシング|の素|のもと|ソース|たれ|タレ|ルウ|ルー|ミックス粉|ケーキミックス|ホットケーキミックス|だし|ブイヨン|コンソメ|調味料|ふりかけ|シーズニング|スプレッド|フィリング|ペースト/;

/** 既製品らしい名前（ドレッシング・〜の素など）。名前だけでは中身が分からないので、袋の裏で確かめてもらう */
export function needsPackageCheck(name: string): boolean {
  return PACKAGED.test(name.normalize("NFKC"));
}

// チョコレート（ミルク・ホワイト以外）は乳を含むものが多いので、確かめてもらうために付ける
const CHOCOLATE = /チョコ|クーベルチュール|ショコラ|カカオマス/;

/** 名前から推定したアレルゲン（表示の順）。何も当たらなければ空 */
export function guessAllergens(name: string): AllergenId[] {
  let s = name.normalize("NFKC");
  for (const re of NOT) s = s.replace(re, " ");
  const hits = RULES.filter((r) => r.re.test(r.not ? s.replace(r.not, " ") : s)).map((r) => r.id);
  for (const c of COMPOUNDS) if (c.re.test(s)) hits.push(...c.ids);
  if (CHOCOLATE.test(s) && !/ハイカカオ|カカオ\d{2}|ビター|ブラック|ノンミルク|ダーク/.test(s)) hits.push("milk");
  return sortAllergens(hits);
}

// 成分表の分類の見出しから誤って付きやすいもの（魚介）。材料自身の名前に無ければ外す
const CATEGORY_PRONE: AllergenId[] = ["shrimp", "crab", "squid", "salmon", "salmonroe", "mackerel", "abalone"];

/**
 * 成分表（mext_*）に結んだ材料の、分類の見出しから誤って付いたアレルゲンを外す。
 * 例：あまえび（＜えび・かに類＞）の「かに」、ゆでだこ（＜いか・たこ類＞）の「いか」。names はお店の名前と成分表の名前
 */
export function dropCategoryHits(allergens: readonly AllergenId[], names: string[]): AllergenId[] {
  const own = new Set(names.flatMap((n) => guessAllergens(n)));
  return allergens.filter((a) => !CATEGORY_PRONE.includes(a) || own.has(a));
}

/** 成分表に結んだ材料で、分類の見出しから誤って付いたらしいアレルゲンがあるもの（確認済みでも見直してもらう） */
export function categorySuspect(i: { allergens?: readonly AllergenId[]; globalRef?: string | null; name: string; labelName?: string }): boolean {
  if (!i.globalRef?.startsWith("mext_")) return false;
  const cur = i.allergens ?? [];
  return dropCategoryHits(cur, [i.name, i.labelName ?? ""]).length < cur.length;
}

/** いまのアレルゲンに、推定と共有の材料のアレルゲンを足したもの（確認画面の初めの値） */
export function suggestAllergens(current: readonly string[], name: string, fromGlobal: readonly string[] = [], globalId?: string | null): AllergenId[] {
  const g = globalId?.startsWith("mext_") ? dropCategoryHits(fromGlobal as AllergenId[], [name]) : fromGlobal;
  return sortAllergens([...current, ...g, ...guessAllergens(name)]);
}
