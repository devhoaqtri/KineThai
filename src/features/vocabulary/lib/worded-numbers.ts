/**
 * Numbers written as words in a deck's Vietnamese text ("hai người", "mười lăm phút",
 * "ba mươi"), each with a verdict on whether digits may replace them.
 *
 * Many number words mean something else too: ba is also father, năm is also year, tám is
 * to chat, chín is ripe, một before a noun is the article "a", thứ hai is Monday, tháng
 * một is January. So every hit gets a verdict, and only `number` is ever changed without
 * a person deciding:
 *   number         a count before a classifier or unit (hai người, ba ngày, năm phút,
 *                  mười giờ, mười tám tuổi), or a compound numeral (hai mươi lăm)
 *   other-meaning  the word means something else here, is part of a joined word or a set
 *                  phrase, or is the answer the card is about
 *   unsure         could be a number, but not certainly; a person decides
 * A number inside a `/…/` mark is always unsure: the mark is a syllable pair the highlight
 * gate checks (docs/highlight-generation-rule.md). Joins (`_`, `=`) around a converted
 * number are kept, so `ba_ngày` becomes `3_ngày`.
 *
 * Used by scripts/scan-worded-numbers.ts (the scan and the bulk apply) and the admin
 * number review (/admin/numbers), where a person settles the English deck's unsure hits.
 *
 * Exports: Verdict, Hit, TextSlot, StoredCard, scanCard, classifyField, applyDigits, applyHit,
 *   textSlots, isNumberCard, plainWords
 * Depends on: nothing
 */

export type Verdict = "number" | "other-meaning" | "unsure";

// ── Number words ─────────────────────────────────────────────────────────────

/** One to nine, in the form that starts a number. */
const DIGIT: Record<string, number> = {
  một: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  năm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
};
/** The ones after mười (mười lăm). "năm" after a ten is the unit year: mười năm. */
const AFTER_TEN: Record<string, number> = {
  một: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  lăm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
};
/** The ones after a tens word (hai mươi mốt, ba mươi tư). */
const AFTER_TENS: Record<string, number> = { ...AFTER_TEN, mốt: 1 };
/** The ones after linh/lẻ (một trăm linh tư). */
const AFTER_ZERO: Record<string, number> = { ...DIGIT, tư: 4 };
const MULTIPLIER: Record<string, number> = {
  nghìn: 1_000,
  ngàn: 1_000,
  triệu: 1_000_000,
  tỷ: 1_000_000_000,
  tỉ: 1_000_000_000,
};
/** Every word the scan reports, whether or not it parses as a number here. */
const NUMBER_WORDS = new Set([
  ...Object.keys(DIGIT),
  ...Object.keys(AFTER_TENS),
  ...Object.keys(MULTIPLIER),
  "mười",
  "mươi",
  "trăm",
  "linh",
  "lẻ",
  "rưỡi",
]);

// ── What follows a count ─────────────────────────────────────────────────────

/**
 * Classifiers and units a number counts. A word here makes the number before it certain.
 * Left out on purpose: bên, phía, tay, chân, mắt, tai, vai, đầu, mặt, chiều (hai bên,
 * hai tay read "both"), con, anh, chị, em, bạn (ba con, hai anh em, hai bạn), mùa (bốn mùa),
 * chuyện (tám chuyện), chục (năm chục nghìn is 50 nghìn, not 5 chục nghìn), and anything
 * that reads as a name or an ordinal after the number.
 */
const UNITS = new Set([
  // Time.
  "giây",
  "phút",
  "giờ",
  "tiếng",
  "ngày",
  "đêm",
  "hôm",
  "tuần",
  "tháng",
  "năm",
  "tuổi",
  "buổi",
  "bữa",
  "tiết",
  "ca",
  "kỳ",
  "kì",
  "đời",
  // People and groups.
  "người",
  "đứa",
  "khách",
  "vị",
  "đội",
  "nhóm",
  "cặp",
  "nhà",
  "lớp",
  "nước",
  "tỉnh",
  // Things.
  "cái",
  "chiếc",
  "quả",
  "trái",
  "cuốn",
  "quyển",
  "tờ",
  "tấm",
  "bức",
  "cục",
  "viên",
  "hạt",
  "miếng",
  "bát",
  "chén",
  "ly",
  "cốc",
  "chai",
  "lon",
  "gói",
  "hộp",
  "túi",
  "thùng",
  "đôi",
  "bộ",
  "căn",
  "ngôi",
  "tòa",
  "toà",
  "tầng",
  "phòng",
  "câu",
  "chữ",
  "từ",
  "trang",
  "bài",
  "chương",
  "dòng",
  "đoạn",
  "môn",
  "điểm",
  "lần",
  "lượt",
  "vòng",
  "bước",
  "món",
  "việc",
  "điều",
  "thứ",
  "loại",
  "kiểu",
  "ván",
  "trận",
  "hiệp",
  "chuyến",
  "bậc",
  "ngón",
  "giọt",
  "cây",
  "cành",
  "bông",
  "đóa",
  "củ",
  "bó",
  "cuộn",
  "sợi",
  "mảnh",
  "khúc",
  "suất",
  "phiếu",
  "vé",
  "tin",
  "cuộc",
  "ổ",
  "ô",
  "ý",
  "số",
  "phần",
  "tá",
  "bàn",
  "ký",
  "kí",
  // Measures and money.
  "km",
  "mét",
  "m",
  "cm",
  "mm",
  "kg",
  "g",
  "gam",
  "ki",
  "cân",
  "lạng",
  "tấn",
  "lít",
  "ml",
  "độ",
  "phân",
  "inch",
  "đồng",
  "xu",
  "đô",
  "usd",
  "euro",
  "yên",
  "won",
  "tệ",
  "milimét",
  "xentimét",
  "dặm",
  "tấc",
  "thước",
  "sào",
]);
/** Units that read differently after a particular number word. */
const UNIT_EXCEPTIONS: Record<string, Set<string>> = {
  // ba bàn: father's table; năm tháng: the years, time passing; năm từ: year from.
  ba: new Set(["nhà", "bàn", "nước", "đời"]),
  năm: new Set(["tháng", "từ", "nhà", "lớp", "thứ", "đời", "kỳ", "kì", "học"]),
  // bàn: hai bàn tay is "both hands".
  hai: new Set(["bàn"]),
  // tám thứ: chat about things; chín: ripe things.
  tám: new Set(["thứ", "chuyện"]),
};
/**
 * Plain nouns a number counts (hai vật, hai trường, hai vế). After ba or năm they could
 * still be father's or a year's, so there they stay unsure.
 */
const COUNT_NOUNS = new Set([
  "vật",
  "trường",
  "âm",
  "vế",
  "nơi",
  "bản",
  "hàng",
  "đường",
  "cách",
  "tuyến",
  "lát",
  "xe",
  "màu",
  "con",
  "ống",
  "bánh",
  "mục",
  "chỗ",
  "cạnh",
  "góc",
  "khối",
  "bảng",
  "tập",
  "khay",
  "thìa",
  "muỗng",
  "lọ",
  "ngụm",
  "lỗi",
  "áo",
  "khu",
  "vùng",
  "làng",
  "tiệm",
  "quán",
  "hãng",
  "mức",
  "mốc",
  "đơn",
  "gian",
  "giường",
  "ghế",
  "cổng",
  "ảnh",
  "tem",
  "mẫu",
  "tháp",
  "quầy",
  "mũi",
  "dây",
  "ngọn",
  "cầu",
  "làn",
  "hồi",
  "gốc",
  "khung",
  "dãy",
  "cửa",
  "bờ",
]);
/** Joined or two-word nouns a number counts, written with `_`. */
const COUNT_COMPOUNDS = new Set(
  `cây_số công_ty phần_trăm câu_lạc_bộ học_sinh chữ_số nhân_viên thành_viên lựa_chọn
  chi_nhánh thành_phố sinh_viên công_nhân cửa_hàng sự_vật sự_việc sự_kiện thế_hệ nam_sinh
  bài_hát vấn_đề khả_năng phương_hướng đơn_vị cầu_thủ anh_trai phương_án mét_vuông
  con_đường dãy_núi xe_máy đáp_án câu_chuyện cửa_sổ cánh_cửa gia_đình hành_khách khu_vực
  bộ_phận diễn_viên châu_lục ngày_nghỉ lượt_xem đầu_sách đường_phụ que_kem mục_tiêu
  bạn_thân con_số lý_do khách_hàng âm_tiết chuyên_gia thí_sinh đường_thẳng thế_kỷ
  vận_động_viên nhân_vật đồ_vật vòng_tròn học_trò thực_khách em_trai người_lạ ý_kiến
  giải_pháp tòa_nhà toà_nhà danh_từ động_từ tính_từ phòng_ngủ yếu_tố cậu_bé giai_đoạn
  nhà_hàng đồng_nghiệp huy_chương chỗ_ngồi ngôn_ngữ buổi_học quốc_gia góc_vuông hãng_bay
  ý_chính hợp_âm dãy_cột bài_báo lượt_thích từ_mới con_ốc con_vít truyện_tranh cây_xanh
  khu_đất điều_lệ tin_vui bánh_ngọt bàn_thắng đô_la ơ_rô đôi_dép đứa_con hóa_đơn
  điện_thoại ý_tưởng mảnh_ghép trường_học xe_đạp trạng_từ nghệ_sĩ chị_họ phương_tiện
  tài_liệu bản_tin phòng_trọ khóa_học nguyên_liệu quả_táo công_viên ô_tô viên_kẹo
  địa_điểm xăng_ti_mét ki_lô_mét ki_lô_gam ki_lô mi_li_mét trang_phục món_ăn tài_khoản
  ghế_ngồi xe_tải vị_trí từ_vựng võ_sĩ lợi_ích thị_trấn ứng_viên lối_đi bạn_đọc vách_đá
  đội_tuyển học_viện ký_tự truyện_ngắn máy_tính đội_trưởng ca_sĩ đối_tượng công_nhân_viên
  giải_thưởng nhiệm_vụ sản_phẩm đặc_điểm cô_gái công_việc cô_bé nhà_khoa_học mặt_hàng
  bánh_xe tín_chỉ học_kỳ phương_pháp bán_cầu cấp_độ bác_sĩ gian_hàng tay_đua nhà_vệ_sinh
  siêu_thị thuyền_viên trạng_thái thương_hiệu môn_học chung_cư chi_tiết giám_đốc ổ_khóa
  kỳ_thủ tác_phẩm phiên_bản phân_xưởng sân_bóng ký_túc_xá đối_thủ lục_địa điều_kiện
  linh_kiện tình_nguyện_viên phạm_trù giường_bệnh mã_lực chị_gái khán_giả thời_điểm
  bề_mặt vai_trò số_liệu màn_hình sở_thích ngón_tay ngón_chân trường_hợp
  thế_giới mệnh_đề ngoại_ngữ hành_tinh tín_hiệu câu_hỏi`.split(/\s+/),
);
/** "hai" before these reads "both": hai bờ sông, hai vai, hai bàn tay. */
const BOTH_AFTER = new Set(
  `bờ vai mép má cánh mắt mí tai chân tay bàn lưỡi quai càng tròng vách bề phe ngả hướng
  lối đầu phía chiều mặt bên họ ta bàn_tay bàn_chân cánh_tay hàm_răng đầu_gối mí_mắt
  khóe_miệng bờ_sông`.split(/\s+/),
);
/** Kin nouns: "hai mẹ con", "hai anh_em" name a pair of relatives, not a count. */
const KIN_NOUNS = new Set(
  "anh chị em bố mẹ cha má ông bà cô chú cậu vợ chồng thầy cháu dì bác".split(" "),
);
const KIN_COMPOUNDS = new Set(
  "anh_em chị_em vợ_chồng ông_bà thầy_cô thầy_trò bố_con mẹ_con cha_con chị_em_gái bạn_bè cô_cháu bà_cháu ông_cháu".split(
    " ",
  ),
);
/** "một" is the article "a" before most nouns; these keep it a count. */
const ONE_UNITS = new Set(["tuổi", "km", "mét", "cm", "kg", "độ", "gam", "lít", "ml"]);
/** Around "một giờ", the clock time (1 o'clock), not "an hour". */
const CLOCK_BEFORE = new Set(["lúc", "đến", "tới", "từ", "khoảng", "gần", "hơn", "quá"]);
const CLOCK_AFTER = new Set([
  "sáng",
  "chiều",
  "tối",
  "đêm",
  "trưa",
  "rưỡi",
  "kém",
  "đúng",
  "khuya",
]);

// ── What comes before ────────────────────────────────────────────────────────

/** thứ hai (Monday, second), tháng ba (March), mùng năm: a name or an ordinal. */
const NAME_BEFORE: Record<string, string> = {
  thứ: "ordinal or weekday (thứ hai)",
  tháng: "month name (tháng một)",
  mùng: "day of the month (mùng năm)",
  mồng: "day of the month (mồng năm)",
  thanh: "tone name (thanh ba)",
  cấp: "school level or grade (cấp ba)",
  hàng: "approximate amount (hàng trăm)",
  vài: "approximate amount (vài trăm)",
  mấy: "approximate amount (mấy trăm)",
  dăm: "approximate amount (dăm trăm)",
};
/** A number after these is a label (tầng ba, lớp hai, trang mười): maybe a digit. */
const LABEL_BEFORE = new Set([
  "điểm",
  "lớp",
  "tầng",
  "lầu",
  "phòng",
  "số",
  "trang",
  "bài",
  "chương",
  "câu",
  "phần",
  "hạng",
  "giải",
  "bậc",
  "khối",
  "kỳ",
  "kì",
  "đợt",
  "vòng",
  "hiệp",
  "ván",
  "tập",
  "khóa",
  "khoá",
  "ngày",
  "năm",
  "đời",
  "quận",
  "tổ",
  "nhóm",
  "đội",
  "kênh",
  "mục",
  "điều",
  "trạm",
  "cửa",
  "ga",
  "bến",
  "giờ",
  "phiên",
  "tuần",
  "lần",
  "học",
]);
/** A count after these is a rate, not a label: ngày hai lần, tuần ba buổi. */
const RATE_BEFORE = new Set(["ngày", "tuần", "tháng", "năm", "giờ", "hôm", "buổi"]);
/** Birth-order names and titles: anh Hai, chị Ba, chú Tám, út. */
const KIN_BEFORE = new Set([
  "anh",
  "chị",
  "cô",
  "chú",
  "bác",
  "dì",
  "cậu",
  "mợ",
  "thím",
  "dượng",
  "ông",
  "bà",
  "út",
  "thằng",
  "con",
  "bé",
  "o",
]);
/** "ba" followed by these is father: ba mẹ, ba tôi, ba ơi. */
const FATHER_AFTER = new Set([
  "mẹ",
  "má",
  "tôi",
  "em",
  "anh",
  "chị",
  "con",
  "mình",
  "nó",
  "bạn",
  "ơi",
  "ạ",
  "à",
  "ấy",
  "của",
  "cháu",
  "cậu",
  "nói",
  "bảo",
  "dặn",
  "về",
  "đi",
  "đã",
  "đang",
  "sẽ",
  "vẫn",
  "cũng",
  "hay",
  "thường",
  "lại",
  "mới",
  "làm",
  "dạy",
  "mua",
  "chở",
  "đưa",
  "cho",
  "khen",
  "la",
  "mắng",
  "gọi",
  "hỏi",
  "kể",
  "ngồi",
  "đứng",
  "nhìn",
  "ôm",
  "xoa",
  "cười",
  "giận",
  "bận",
  "mất",
  "nuôi",
  "lo",
  "thì",
]);
/** Words after a lone "năm" that make it a year. */
const YEAR_AFTER = new Set([
  "nay",
  "ngoái",
  "mới",
  "sau",
  "trước",
  "học",
  "nhất",
  "cuối",
  "đầu",
  "nào",
  "rồi",
  "ấy",
  "đó",
  "kia",
  "xưa",
  "tháng",
  "tài",
  "sinh",
  "nhuận",
  "qua",
  "tới",
  "này",
  "trời",
  "thứ",
  "liền",
]);
/** Words before a lone "năm" that make it a year. */
const YEAR_BEFORE = new Set([
  "mỗi",
  "hằng",
  "hàng",
  "cả",
  "trong",
  "cuối",
  "đầu",
  "giữa",
  "những",
  "các",
  "nhiều",
  "bao",
  "quanh",
  "suốt",
  "sang",
  "từng",
  "một",
  "lâu",
  "chục",
  "trăm",
  "nghìn",
  "vào",
  "qua",
  "tết",
  "này",
  "cùng",
  "sinh",
  "chúc",
  "năm",
]);

/** Set phrases whose number words stay words. Matched on plain lowercase text. */
const IDIOMS = [
  "một mình",
  "một chút",
  "một số",
  "một lúc",
  "một khi",
  "một cách",
  "một vài",
  "một nửa",
  "một ít",
  "một tí",
  "cả hai",
  "cả ba",
  "hai bên",
  "hai tay",
  "hai mặt",
  "hai lòng",
  "hai chiều",
  "hai đầu",
  "hai phía",
  "bốn bề",
  "bốn phương",
  "bốn phía",
  "bốn mùa",
  "bốn biển",
  "năm châu",
  "ba hoa",
  "ba phải",
  "ba láp",
  "ba trợn",
  "ba gai",
  "ba que",
  "ba xu",
  "ba chân bốn cẳng",
  "ba chìm bảy nổi",
  "bảy nổi ba chìm",
  "năm bè bảy mối",
  "ba bề bốn bên",
  "năm thì mười họa",
  "năm thì mười hoạ",
  "chín người mười ý",
  "mười phân vẹn mười",
  "mười mươi",
  "một công đôi việc",
  "một vốn bốn lời",
  "một nắng hai sương",
  "một sớm một chiều",
  "một trời một vực",
  "ba đầu sáu tay",
  "ba mặt một lời",
  "trăm năm",
  "trăm phần trăm",
  "ngàn năm",
  "nghìn năm",
  "nghìn lẻ một",
  "chín suối",
  "chín tầng mây",
  "chín chắn",
  "tám chuyện",
  "bảy sắc",
  "sáu múi",
  "năm ba",
  "dăm ba",
  "một hai",
  "đôi ba",
  "ba bảy",
  "phần ba",
  "phần tư",
  "phần năm",
  "phần mười",
  "phần trăm",
  "ba lô",
  "ba lê",
  "ba ba",
  "ba gác",
  "ba toong",
  "ba tê",
  "ba rọi",
  "ba chỉ",
  "ngã ba",
  "ngã tư",
  "ngã năm",
  "ngã sáu",
  "tư duy",
  "tư thế",
  "tư liệu",
  "tư vấn",
  "tư nhân",
  "tư cách",
  "tư tưởng",
  "tư bản",
  "tư lệnh",
  "tư pháp",
  "riêng tư",
  "đầu tư",
  "hai lúa",
  "hai mang",
  "mười mấy",
  "mươi mấy",
];

// ── Text ─────────────────────────────────────────────────────────────────────

type Token = {
  /** As written. */
  raw: string;
  /** Lowercase, NFC. */
  key: string;
  start: number;
  end: number;
  /** The characters between the previous token and this one. */
  before: string;
  inMark: boolean;
};

const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

/** Where each `/…/` mark sits in the text. */
function markRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "/") continue;
    if (open < 0) open = index;
    else {
      ranges.push([open, index]);
      open = -1;
    }
  }
  return ranges;
}

function tokenize(text: string): Token[] {
  const marks = markRanges(text);
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index!;
    const end = start + match[0].length;
    tokens.push({
      raw: match[0],
      key: match[0].normalize("NFC").toLowerCase(),
      start,
      end,
      before: text.slice(last, start),
      inMark: marks.some(([open, close]) => start > open && end <= close),
    });
    last = end;
  }
  return tokens;
}

/** Two tokens are one stretch of speech: only spaces, a connector or a phrase edge. */
// A phrase edge (`|`) is only a place to break a line, so the words still read on.
const flows = (between: string) => /^(\s+|_|=|\s*\|\s*)$/.test(between);
/** A connector (`_` or `=`, marks aside) ties two tokens into one joined group. */
const joins = (between: string) => /^\/?[_=]\/?$/.test(between);
/** Plain lowercase words: marks, joins, edges and punctuation gone. */
export const plainWords = (text: string) =>
  (text.normalize("NFC").toLowerCase().match(TOKEN) ?? []).join(" ");

// ── Parsing ──────────────────────────────────────────────────────────────────

type Parsed = { end: number; value: number; hasMultiplier: boolean; groups: number };

/** A value under 1000 starting at `index`, as written in Vietnamese. */
function parseGroup(keys: string[], links: boolean[], index: number): Parsed | null {
  const at = (offset: number) => (links[index + offset] ? keys[index + offset] : undefined);
  const first = keys[index];
  if (first === undefined) return null;
  // Hundreds: hai trăm, hai trăm linh năm, hai trăm ba mươi.
  if (first in DIGIT && at(1) === "trăm") {
    let value = DIGIT[first]! * 100;
    let end = index + 2;
    const next = links[end] ? keys[end] : undefined;
    const after = links[end + 1] ? keys[end + 1] : undefined;
    if ((next === "linh" || next === "lẻ") && after !== undefined && after in AFTER_ZERO) {
      value += AFTER_ZERO[after]!;
      end += 2;
    } else {
      const tens = parseTens(keys, links, end, true);
      if (tens) {
        value += tens.value;
        end = tens.end;
      }
    }
    return { end, value, hasMultiplier: false, groups: 1 };
  }
  return parseTens(keys, links, index, false);
}

function parseTens(
  keys: string[],
  links: boolean[],
  index: number,
  linked: boolean,
): Parsed | null {
  if (linked && !links[index]) return null;
  const first = keys[index];
  const next = links[index + 1] ? keys[index + 1] : undefined;
  if (first === "mười") {
    if (next !== undefined && next in AFTER_TEN)
      return { end: index + 2, value: 10 + AFTER_TEN[next]!, hasMultiplier: false, groups: 1 };
    return { end: index + 1, value: 10, hasMultiplier: false, groups: 1 };
  }
  if (first !== undefined && first in DIGIT && first !== "một" && next === "mươi") {
    const ones = links[index + 2] ? keys[index + 2] : undefined;
    if (ones !== undefined && ones in AFTER_TENS)
      return {
        end: index + 3,
        value: DIGIT[first]! * 10 + AFTER_TENS[ones]!,
        hasMultiplier: false,
        groups: 1,
      };
    return { end: index + 2, value: DIGIT[first]! * 10, hasMultiplier: false, groups: 1 };
  }
  if (!linked && first !== undefined && first in DIGIT)
    return { end: index + 1, value: DIGIT[first]!, hasMultiplier: false, groups: 1 };
  return null;
}

/** A whole number at `index`: groups joined by nghìn, triệu, tỷ. */
function parseNumber(keys: string[], links: boolean[], index: number): Parsed | null {
  const head = parseGroup(keys, links, index);
  if (!head) return null;
  let total = 0;
  let group = head;
  // Groups written: "hai nghìn" is 1, "hai nghìn ba trăm" is 2.
  let groups = 1;
  let hasMultiplier = false;
  for (;;) {
    const word = links[group.end] ? keys[group.end] : undefined;
    if (word === undefined || !(word in MULTIPLIER)) {
      total += group.value;
      break;
    }
    total += group.value * MULTIPLIER[word]!;
    hasMultiplier = true;
    const rest = links[group.end + 1] ? parseGroup(keys, links, group.end + 1) : null;
    // A bare digit after a multiplier is a unit or a shorthand, never part of the number
    // here: "hai nghìn năm" is two thousand years, "nghìn hai" is a spoken 1,200.
    if (!rest || rest.end - (group.end + 1) === 1) {
      return { end: group.end + 1, value: total, hasMultiplier, groups };
    }
    groups += 1;
    group = rest;
  }
  return { end: group.end, value: total, hasMultiplier, groups };
}

// ── Verdicts ─────────────────────────────────────────────────────────────────

export type Hit = {
  deck: string;
  id: string;
  field: string;
  text: string;
  /** The number words, as written. */
  words: string;
  start: number;
  end: number;
  verdict: Verdict;
  reason: string;
  /** The digits that would replace `words`: what `number` writes, a suggestion otherwise. */
  digits?: string;
  /** Stable across scans while the words around it stay: card, field, context, occurrence. */
  key: string;
};

type Card = { meaning: string; numberCard: boolean };

/** True when the card's own answer is a number (三, hai mươi, một tá, ba ngày). */
export function isNumberCard(meaningVi: string): boolean {
  return meaningVi
    .split(/[,;]/)
    .map((part) => plainWords(part).split(" ").filter(Boolean))
    .some((words) => {
      const body =
        words[0] === "số" || words[0] === "mùng" || words[0] === "ngày" ? words.slice(1) : words;
      if (body.length === 0 || (body.length === 1 && body[0] === "năm")) return false;
      const links = body.map((_, index) => index > 0);
      const parsed = parseNumber(body, links, 0);
      if (!parsed) {
        // trăm, nghìn, mười nghìn: a bare multiplier is the number itself.
        return body.every((word) => word in MULTIPLIER || word === "trăm" || word === "mười");
      }
      const rest = body.slice(parsed.end);
      return rest.length === 0 || (rest.length === 1 && (UNITS.has(rest[0]!) || rest[0] === "cái"));
    });
}

function containsPhrase(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `);
}

function idiomAt(tokens: Token[], from: number, to: number): string | undefined {
  for (const idiom of IDIOMS) {
    const words = idiom.split(" ");
    for (let start = Math.max(0, from - words.length + 1); start <= to; start += 1) {
      if (start + words.length > tokens.length) continue;
      const matches = words.every(
        (word, offset) =>
          tokens[start + offset]!.key === word &&
          (offset === 0 || flows(tokens[start + offset]!.before)),
      );
      // The idiom must cover at least one token of the run.
      if (matches && start <= to - 1 && start + words.length > from) return idiom;
    }
  }
  return undefined;
}

/** Does this token start a sentence (so a capital letter means nothing)? */
function startsSentence(tokens: Token[], index: number): boolean {
  if (index === 0) return true;
  const before = tokens[index]!.before.replace(/[\s/"“”'‘’([«]/g, "");
  return /[.!?…:]$/.test(before) || before.endsWith("\n");
}

/**
 * The digits for a parsed run, or null when the form is not settled.
 * Under a thousand: plain digits. One multiplier with nothing after it keeps its word:
 * "3 nghìn", "20 triệu". Anything longer (1.200, or 1 nghìn 2 trăm?) is a formatting
 * choice, so it is left to a person.
 */
function render(parsed: Parsed, tokens: Token[], from: number): string | null {
  if (!parsed.hasMultiplier) return String(parsed.value);
  if (parsed.groups !== 1) return null;
  const multiplier = tokens[parsed.end - 1]!;
  const keys = tokens.map((token) => token.key);
  const links = tokens.map((token, index) => index > 0 && flows(token.before));
  const head = parseGroup(keys, links, from);
  if (!head || head.end !== parsed.end - 1) return null;
  return `${head.value} ${multiplier.raw}`;
}

type Follow = {
  /** unit: a classifier or measure; count: a plain noun counted; kin: a pair of
   * relatives; both: "hai" here reads "both"; none: nothing a number counts. */
  kind: "unit" | "count" | "kin" | "both" | "none";
  /** The word after the number, joined syllables written with `_`. */
  word: string;
  /** Its first syllable, lowercase. */
  first?: string;
  /** The syllable after that word, if the sentence flows on. */
  after?: string;
};

/** What the number at tokens[..end) is followed by. */
function whatFollows(tokens: Token[], end: number): Follow {
  if (end >= tokens.length || !flows(tokens[end]!.before)) return { kind: "none", word: "" };
  const first = tokens[end]!.key;
  // A joined word after the number: công_ty, anh_em, bàn_tay.
  let last = end;
  while (last + 1 < tokens.length && /^\/?_\/?$/.test(tokens[last + 1]!.before)) last += 1;
  const afterAt = (at: number) =>
    at < tokens.length && flows(tokens[at]!.before) ? tokens[at]!.key : undefined;
  if (last > end) {
    const word = tokens
      .slice(end, last + 1)
      .map((token) => token.key)
      .join("_");
    const after = afterAt(last + 1);
    if (KIN_COMPOUNDS.has(word)) return { kind: "kin", word, first, after };
    if (BOTH_AFTER.has(word)) return { kind: "both", word, first, after };
    if (COUNT_COMPOUNDS.has(word)) return { kind: "unit", word, first, after };
    return { kind: "none", word, first, after };
  }
  // The same nouns written as two loose words: công ty, anh em, bàn tay.
  const second = afterAt(end + 1);
  if (second !== undefined && /^\s+$/.test(tokens[end + 1]!.before)) {
    const pair = `${first}_${second}`;
    const after = afterAt(end + 2);
    if (
      KIN_COMPOUNDS.has(pair) ||
      (KIN_NOUNS.has(first) && (KIN_NOUNS.has(second) || ["con", "trò"].includes(second)))
    )
      return { kind: "kin", word: pair, first, after };
    if (BOTH_AFTER.has(pair)) return { kind: "both", word: pair, first, after };
    if (COUNT_COMPOUNDS.has(pair)) return { kind: "unit", word: pair, first, after };
  }
  const after = afterAt(end + 1);
  if (UNITS.has(first)) return { kind: "unit", word: first, first, after };
  if (COUNT_NOUNS.has(first)) return { kind: "count", word: first, first, after };
  if (BOTH_AFTER.has(first)) return { kind: "both", word: first, first, after };
  return { kind: "none", word: first, first, after };
}

export function classifyField(
  deck: string,
  id: string,
  field: string,
  text: string,
  card: Card,
): Hit[] {
  const tokens = tokenize(text);
  const keys = tokens.map((token) => token.key);
  const links = tokens.map((token, index) => index > 0 && flows(token.before));
  const hits: Hit[] = [];
  const consumed = new Set<number>();

  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed.has(index) || !NUMBER_WORDS.has(keys[index]!)) continue;
    const parsed = parseNumber(keys, links, index);
    const end = parsed ? parsed.end : index + 1;
    for (let at = index; at < end; at += 1) consumed.add(at);
    const first = tokens[index]!;
    const last = tokens[end - 1]!;
    const runKeys = keys.slice(index, end);
    const words = text.slice(first.start, last.end);
    const hit: Hit = {
      deck,
      id,
      field,
      text,
      words,
      start: first.start,
      end: last.end,
      verdict: "unsure",
      reason: "",
      key: "",
    };
    hits.push(hit);
    {
      const before = index > 0 ? keys[index - 1] : "";
      const afterRun = end < tokens.length ? keys[end] : "";
      const context = `${field}|${before}[${runKeys.join(" ")}]${afterRun}`;
      const seen = hits.filter((other) => other.key.startsWith(`${deck}|${id}|${context}#`)).length;
      hit.key = `${deck}|${id}|${context}#${seen}`;
    }
    const set = (verdict: Verdict, reason: string) => {
      hit.verdict = verdict;
      hit.reason = reason;
    };

    const prevLinked = index > 0 && flows(first.before);
    const prev = prevLinked ? keys[index - 1] : undefined;
    const runText = runKeys.join(" ");
    const head = runKeys[0]!;
    const single = end - index === 1;
    const follow = whatFollows(tokens, end);
    const next = follow.first;
    const after = follow.after;
    // A unit that reads differently after this number word (ba nhà, năm tháng) is no unit.
    const unitAfter =
      follow.kind === "unit" && !(single && UNIT_EXCEPTIONS[head]?.has(follow.word));
    // A plain noun counted (hai vật); after ba or năm it might be father's or a year's.
    const countAfter =
      follow.kind === "count" || (follow.kind === "both" && (!single || head !== "hai"));
    const countable = unitAfter || (countAfter && (!single || (head !== "ba" && head !== "năm")));

    // The unit right after a count is not a number of its own: "mười năm" is ten years.
    if (parsed && follow.word === "năm" && unitAfter) consumed.add(end);

    if (!parsed) {
      const reason =
        head === "rưỡi"
          ? "rưỡi (a half) has no digit form here"
          : head === "tư"
            ? "tư outside a compound numeral (tư duy, thứ tư, một phần tư)"
            : head in MULTIPLIER || head === "trăm"
              ? `${head} with no count before it (triệu chứng, tỷ lệ, trăm năm)`
              : `${head} outside a compound numeral (ngày mốt, linh hoạt, lẻ loi)`;
      set("other-meaning", reason);
      continue;
    }
    if (field === "meaningVi") {
      set("other-meaning", "the gloss itself (the answer's meaning)");
      continue;
    }
    // After digits, a unit word is that number's unit: "10 năm" is ten years. This keeps a
    // second run from reading the year of an already converted "20 năm" as a five.
    const beforeMultiplier =
      index > 1 && flows(tokens[index - 1]!.before) ? keys[index - 2] : undefined;
    const prevIsDigits =
      prev !== undefined &&
      (/^\p{N}+$/u.test(prev) ||
        (prev in MULTIPLIER &&
          beforeMultiplier !== undefined &&
          /^\p{N}+$/u.test(beforeMultiplier)));
    if (prevIsDigits && single && (UNITS.has(head) || head === "năm")) {
      set("other-meaning", `the unit of the number before it (${prev} ${head})`);
      continue;
    }
    if (card.numberCard) {
      set("other-meaning", "the card's answer is a number: its clue numbers are the riddle");
      continue;
    }
    if (containsPhrase(card.meaning, runText)) {
      set("other-meaning", `the card's answer contains "${runText}"`);
      continue;
    }
    const idiom = idiomAt(tokens, index, end);
    if (idiom) {
      set("other-meaning", `set phrase "${idiom}"`);
      continue;
    }
    // Joined to a word that is neither this number nor its unit: part of that word.
    const joinedBefore = index > 0 && joins(first.before);
    const joinedAfter = end < tokens.length && joins(tokens[end]!.before);
    if (joinedBefore) {
      set(
        "other-meaning",
        `joined to the word before it (${keys[index - 1]}_${runKeys.join("_")})`,
      );
      continue;
    }
    if (joinedAfter && !countable && !(single && head === "một" && ONE_UNITS.has(next ?? ""))) {
      set("other-meaning", `joined to the word after it (${runKeys.join("_")}_${keys[end]})`);
      continue;
    }
    if (prev !== undefined && prev in NAME_BEFORE) {
      // mỗi tháng hai lần: a count after a month word, not February.
      if (prev === "tháng" && countable)
        set("unsure", "after tháng but before a unit (tháng hai lần?)");
      else set("other-meaning", NAME_BEFORE[prev]!);
      continue;
    }
    if (prev !== undefined && KIN_BEFORE.has(prev) && single) {
      set(countable ? "unsure" : "other-meaning", "birth-order name or title (anh Hai, chú Tám)");
      continue;
    }
    if (single && /^\p{Lu}/u.test(first.raw) && !startsSentence(tokens, index)) {
      set("other-meaning", "a capitalized name mid-sentence");
      continue;
    }
    if (follow.kind === "kin") {
      set("other-meaning", `a pair of relatives (${runText} ${follow.word.replaceAll("_", " ")})`);
      continue;
    }
    if (follow.kind === "both" && single && head === "hai") {
      set("other-meaning", `hai = both (hai ${follow.word.replaceAll("_", " ")})`);
      continue;
    }
    if (head === "năm" && single && next !== undefined && /^\p{N}/u.test(next)) {
      set("other-meaning", "năm = year (năm 2000)");
      continue;
    }
    // Two numbers side by side are a range or a saying: hai ba ngày, ba chân bốn cẳng.
    const prevIsNumber = prev !== undefined && NUMBER_WORDS.has(prev) && prev !== "rưỡi";
    const nextIsNumber = next !== undefined && NUMBER_WORDS.has(next) && !countable;
    if (prevIsNumber || nextIsNumber) {
      set("unsure", "two number words side by side (a range or a saying?)");
      continue;
    }
    if (first.inMark || last.inMark) {
      set("unsure", "inside a /…/ mark: a digit would break the highlight pair");
      continue;
    }
    // Minutes of a clock time: mười giờ ba mươi, tám giờ kém mười lăm.
    const beforePrev = index > 1 && flows(tokens[index - 1]!.before) ? keys[index - 2] : undefined;
    if (
      (prev === "giờ" || prev === "kém") &&
      parsed.value < 60 &&
      beforePrev !== undefined &&
      (NUMBER_WORDS.has(beforePrev) ||
        /^\p{N}+$/u.test(beforePrev) ||
        (prev === "kém" && beforePrev === "giờ"))
    ) {
      set("number", "minutes of a clock time");
      continue;
    }
    // A number after the unit makes one measure: một mét sáu, hai phần ba, ba bậc một.
    const afterIsNumber =
      after !== undefined &&
      (/^\p{N}/u.test(after) || (NUMBER_WORDS.has(after) && after !== "rưỡi")) &&
      follow.word !== "giờ" &&
      !(follow.word === "phần" && after === "trăm");
    if (single && head === "một") {
      const clock =
        next === "giờ" && (CLOCK_BEFORE.has(prev ?? "") || CLOCK_AFTER.has(after ?? ""));
      if (afterIsNumber && (clock || ONE_UNITS.has(next ?? ""))) {
        set("unsure", `a number after the unit (${runText} ${follow.word} ${after})`);
      } else if (clock || ONE_UNITS.has(next ?? "")) {
        set("number", clock ? "a clock time (lúc một giờ)" : `one ${next}: a measure or an age`);
      } else {
        set("other-meaning", "một before a noun reads as the article a/an");
      }
      continue;
    }
    // tầng hai, lớp ba: a label. Before a unit it is still one unless the word before is
    // a time, which makes a rate: "ngày hai lần", "tuần ba buổi".
    if (prev !== undefined && LABEL_BEFORE.has(prev) && (!countable || !RATE_BEFORE.has(prev))) {
      set("unsure", `a label after a noun (${prev} ${runText}): an ordinal, maybe a digit`);
      continue;
    }
    if (countable) {
      if (afterIsNumber) {
        set(
          "unsure",
          `a number after the unit (${runText} ${follow.word.replaceAll("_", " ")} ${after})`,
        );
        continue;
      }
      if (head === "ba" && single && FATHER_AFTER.has(after ?? "") && follow.word === "người") {
        set("unsure", "ba người + pronoun");
        continue;
      }
      set(
        "number",
        `a count before a ${unitAfter ? "unit" : "noun"} (${runText} ${follow.word.replaceAll("_", " ")})`,
      );
      continue;
    }
    if (countAfter) {
      set(
        "unsure",
        `${head} before a noun: a count, or ${head === "ba" ? "father's" : "a year's"}? (${runText} ${follow.word.replaceAll("_", " ")})`,
      );
      continue;
    }
    if (!single) {
      set("number", "a compound numeral");
      continue;
    }
    if (head === "ba" && (next === undefined || FATHER_AFTER.has(next))) {
      set(
        next === undefined ? "unsure" : "other-meaning",
        next === undefined
          ? "ba with nothing after it (three, or father?)"
          : `ba = father (ba ${next})`,
      );
      continue;
    }
    if (
      head === "năm" &&
      (YEAR_AFTER.has(next ?? "") || YEAR_BEFORE.has(prev ?? "") || next === undefined)
    ) {
      set("other-meaning", "năm = year");
      continue;
    }
    if (head === "tám") {
      set("other-meaning", "tám with no unit: to chat (tám chuyện, ngồi tám)");
      continue;
    }
    if (head === "chín") {
      set("other-meaning", "chín with no unit: ripe or cooked");
      continue;
    }
    set(
      "unsure",
      `no unit after it (${runText}${next ? ` ${follow.word.replaceAll("_", " ")}` : ""})`,
    );
  }

  // Render the certain ones, and keep a number next to an unsure one unsure too, so a
  // phrase is never half digits: "hai đến ba ngày".
  for (const hit of hits) {
    const from = tokens.findIndex((token) => token.start === hit.start);
    const parsed = parseNumber(keys, links, from);
    if (!parsed || parsed.end - from !== hit.words.split(/[\s_=|]+/).filter(Boolean).length)
      continue;
    const digits = render(parsed, tokens, from);
    if (digits !== null) hit.digits = digits;
    else if (hit.verdict === "number") {
      hit.verdict = "unsure";
      hit.reason = `a large number with no settled digit form (${hit.words})`;
    }
    // A suggestion for a person deciding: the full value, grouped the Vietnamese way.
    if (hit.verdict !== "number" && digits === null)
      hit.digits = parsed.value.toLocaleString("vi-VN");
  }
  for (const hit of hits) {
    if (hit.verdict !== "number") continue;
    const near = hits.find(
      (other) =>
        other !== hit &&
        other.verdict === "unsure" &&
        Math.abs(other.start - hit.start) < 24 &&
        !/[.!?]/.test(text.slice(Math.min(other.end, hit.end), Math.max(other.start, hit.start))),
    );
    if (near) {
      hit.verdict = "unsure";
      hit.reason = `next to an unsure number ("${near.words}")`;
    }
  }
  return hits;
}

// ── Cards ────────────────────────────────────────────────────────────────────

export type TextSlot = { field: string; get: () => unknown; set: (value: string) => void };

/** A card, or a part of one, as a deck file stores it. */
export type StoredCard = Record<string, unknown>;

const listOf = (value: unknown): StoredCard[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is StoredCard => typeof entry === "object")
    : [];

/**
 * Every Vietnamese prose field on a card, each one readable and writable in place.
 * @param word - the card as stored (it is changed through `set`)
 * @returns One slot per field, named as a path: defVi, usage[0].vi, grammar.tipVi
 */
export function textSlots(word: StoredCard): TextSlot[] {
  const out: TextSlot[] = [];
  const own = (holder: StoredCard, key: string, field: string) =>
    out.push({ field, get: () => holder[key], set: (value) => (holder[key] = value) });
  for (const key of ["meaningVi", "defVi", "leadVi", "anticipateVi"]) own(word, key, key);
  listOf(word.usage).forEach((usage, index) => own(usage, "vi", `usage[${index}].vi`));
  const grammar = word.grammar;
  if (grammar && typeof grammar === "object" && !Array.isArray(grammar)) {
    const notes = grammar as StoredCard;
    own(notes, "tipVi", "grammar.tipVi");
    own(notes, "serEstar", "grammar.serEstar");
    listOf(notes.collocations).forEach((collocation, index) =>
      own(collocation, "vi", `grammar.collocations[${index}].vi`),
    );
  }
  // Flat grammar keys, in case a deck writes them on the card.
  if (typeof word.tipVi === "string") own(word, "tipVi", "tipVi");
  return out;
}

/**
 * Write digits into one text: its `number` hits, back to front.
 * @pure true
 */
export function applyDigits(text: string, hits: Hit[]): string {
  let out = text;
  for (const hit of [...hits].sort((a, b) => b.start - a.start)) {
    if (hit.verdict !== "number" || hit.digits === undefined) continue;
    out = out.slice(0, hit.start) + hit.digits + out.slice(hit.end);
  }
  return out;
}

/**
 * Every number-word hit on one card.
 * @param deck - the deck file, relative to the data folder (packs/en-a1.json)
 * @param word - the card as stored
 * @returns The hits in field order
 * @pure true
 */
export function scanCard(deck: string, word: StoredCard): Hit[] {
  const meaningVi = typeof word.meaningVi === "string" ? word.meaningVi : "";
  const card: Card = { meaning: plainWords(meaningVi), numberCard: isNumberCard(meaningVi) };
  const hits: Hit[] = [];
  for (const slot of textSlots(word)) {
    const text = slot.get();
    if (typeof text !== "string" || text === "") continue;
    hits.push(...classifyField(deck, String(word.id), slot.field, text, card));
  }
  return hits;
}

/**
 * One hit written as digits, whatever its verdict: what a person chose.
 * @returns The text with that hit's words replaced, or the text unchanged if it has none
 * @pure true
 */
export function applyHit(text: string, hit: Hit): string {
  if (hit.digits === undefined || text.slice(hit.start, hit.end) !== hit.words) return text;
  return text.slice(0, hit.start) + hit.digits + text.slice(hit.end);
}
