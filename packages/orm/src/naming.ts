/**
 * Default names, ported from each framework's own source (versions and URLs in
 * documentation/RESEARCH_AND_ASSUMPTIONS.md R31). Each function names the framework it copies,
 * because the rules differ: TypeORM, MikroORM and Flask-SQLAlchemy split words differently, and
 * Rails, GORM, Sequelize and Mongoose pluralise with different word lists.
 */

/** TypeORM 0.3 `StringUtils.snakeCase` (DefaultNamingStrategy.tableName). */
export function typeormSnake(s: string): string {
  return s
    .replace(/([A-Z])([A-Z])([a-z])/g, '$1_$2$3')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/** TypeORM 0.3 `StringUtils.camelCase` (DefaultNamingStrategy.joinColumnName). */
export function typeormCamel(s: string): string {
  return s.replace(/^([A-Z])|[\s-_](\w)/g, (_m, p1: string | undefined, p2: string | undefined) =>
    p2 ? p2.toUpperCase() : (p1 ?? '').toLowerCase(),
  );
}

/** MikroORM 6 `UnderscoreNamingStrategy.underscore`. */
export function mikroUnderscore(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Flask-SQLAlchemy 3.1 `camel_to_snake_case`. */
export function flaskSnake(s: string): string {
  return s
    .replace(/((?<=[a-z0-9])[A-Z]|(?!^)[A-Z](?=[a-z]))/g, '_$1')
    .toLowerCase()
    .replace(/^_+/, '');
}

/** Rails `String#underscore` (ActiveSupport), for a class name without its module. */
export function railsUnderscore(s: string): string {
  return s
    .replace(/::/g, '/')
    .replace(/([A-Z\d]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/** Peewee 3 snake case (`make_snake_case`), used when `legacy_table_names` is False. */
export function peeweeSnake(s: string): string {
  return s
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

const GORM_INITIALISMS = [
  'API',
  'ASCII',
  'CPU',
  'CSS',
  'DNS',
  'EOF',
  'GUID',
  'HTML',
  'HTTP',
  'HTTPS',
  'ID',
  'IP',
  'JSON',
  'LHS',
  'QPS',
  'RAM',
  'RHS',
  'RPC',
  'SLA',
  'SMTP',
  'SSH',
  'TLS',
  'TTL',
  'UID',
  'UI',
  'UUID',
  'URI',
  'URL',
  'UTF8',
  'VM',
  'XML',
  'XSRF',
  'XSS',
];

/** GORM 1.31 `NamingStrategy.toDBName`: initialisms first, then snake case. */
export function gormDbName(name: string): string {
  if (!name) return '';
  // strings.NewReplacer: at each position the first listed initialism that matches wins.
  let value = '';
  for (let i = 0; i < name.length;) {
    const hit = GORM_INITIALISMS.find((w) => name.startsWith(w, i));
    if (hit) {
      value += hit[0] + hit.slice(1).toLowerCase();
      i += hit.length;
    } else value += name[i++];
  }
  const up = (c: string | undefined) => c !== undefined && c >= 'A' && c <= 'Z';
  const digit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
  let out = '';
  let lastCase = false;
  let curCase = up(value[0]);
  for (let i = 0; i < value.length - 1; i++) {
    const v = value[i]!;
    const nextCase = up(value[i + 1]);
    const nextNumber = digit(value[i + 1]);
    if (curCase) {
      if (lastCase && (nextCase || nextNumber)) out += v.toLowerCase();
      else {
        if (i > 0 && value[i - 1] !== '_' && value[i + 1] !== '_') out += '_';
        out += v.toLowerCase();
      }
    } else out += v;
    lastCase = curCase;
    curCase = nextCase;
  }
  const last = value[value.length - 1]!;
  if (curCase) {
    if (!lastCase && value.length > 1) out += '_';
    out += last.toLowerCase();
  } else out += last;
  return out;
}

// --------------------------------------------------------------------------- pluralisers

type Rule = [RegExp, string];

/** Rails 8 ActiveSupport inflections: rules listed in source order, applied last first. */
const RAILS_PLURAL: Rule[] = [
  [/$/, 's'],
  [/s$/i, 's'],
  [/^(ax|test)is$/i, '$1es'],
  [/(octop|vir)us$/i, '$1i'],
  [/(octop|vir)i$/i, '$1i'],
  [/(alias|status)$/i, '$1es'],
  [/(bu)s$/i, '$1ses'],
  [/(buffal|tomat)o$/i, '$1oes'],
  [/([ti])um$/i, '$1a'],
  [/([ti])a$/i, '$1a'],
  [/sis$/i, 'ses'],
  [/(?:([^f])fe|([lr])f)$/i, '$1$2ves'],
  [/(hive)$/i, '$1s'],
  [/([^aeiouy]|qu)y$/i, '$1ies'],
  [/(x|ch|ss|sh)$/i, '$1es'],
  [/(matr|vert|ind)(?:ix|ex)$/i, '$1ices'],
  [/^(m|l)ouse$/i, '$1ice'],
  [/^(m|l)ice$/i, '$1ice'],
  [/^(ox)$/i, '$1en'],
  [/^(oxen)$/i, '$1'],
  [/(quiz)$/i, '$1zes'],
];
const RAILS_IRREGULAR: [string, string][] = [
  ['person', 'people'],
  ['man', 'men'],
  ['child', 'children'],
  ['sex', 'sexes'],
  ['move', 'moves'],
  ['zombie', 'zombies'],
];
const RAILS_UNCOUNTABLE = [
  'equipment',
  'information',
  'rice',
  'money',
  'species',
  'series',
  'fish',
  'sheep',
  'jeans',
  'police',
];
/** jinzhu/inflection (used by GORM): Rails's rules with a longer uncountable list. */
const GORM_UNCOUNTABLE = [
  ...RAILS_UNCOUNTABLE,
  'milk',
  'salt',
  'time',
  'water',
  'paper',
  'food',
  'art',
  'cash',
  'music',
  'help',
  'luck',
  'oil',
  'progress',
  'rain',
  'research',
  'shopping',
  'software',
  'traffic',
];

function railsStyle(word: string, uncountable: string[]): string {
  const lower = word.toLowerCase();
  // Rails matches uncountables and irregulars against the end of the (last) word.
  if (uncountable.some((u) => lower === u || lower.endsWith(`_${u}`))) return word;
  for (const [one, many] of RAILS_IRREGULAR) {
    const re = new RegExp(`(^|_)${one}$`, 'i');
    if (re.test(word)) return word.replace(re, `$1${many}`);
  }
  for (let i = RAILS_PLURAL.length - 1; i >= 0; i--) {
    const [re, rep] = RAILS_PLURAL[i]!;
    if (re.test(word))
      return word.replace(re, (...m: string[]) =>
        rep.replace(/\$(\d)/g, (_x, d: string) => m[Number(d)] ?? ''),
      );
  }
  return word;
}

export const railsPlural = (w: string) => railsStyle(w, RAILS_UNCOUNTABLE);
export const gormPlural = (w: string) => railsStyle(w, GORM_UNCOUNTABLE);

/** Rails `Model.table_name`: the class name without its module, underscored and pluralised. */
export const railsTableName = (cls: string) =>
  railsPlural(railsUnderscore(cls.split('::').pop() ?? cls));

/** GORM `NamingStrategy.TableName`: snake case, then plural. */
export const gormTableName = (struct: string) => gormPlural(gormDbName(struct));

/** Mongoose 8 `helpers/pluralize.js`: lower case, then the first rule that matches. */
const MONGOOSE_RULES: Rule[] = [
  [/human$/gi, 'humans'],
  [/(m)an$/gi, '$1en'],
  [/(pe)rson$/gi, '$1ople'],
  [/(child)$/gi, '$1ren'],
  [/^(ox)$/gi, '$1en'],
  [/(ax|test)is$/gi, '$1es'],
  [/(octop|vir)us$/gi, '$1i'],
  [/(alias|status)$/gi, '$1es'],
  [/(bu)s$/gi, '$1ses'],
  [/(buffal|tomat|potat)o$/gi, '$1oes'],
  [/([ti])um$/gi, '$1a'],
  [/sis$/gi, 'ses'],
  [/(?:([^f])fe|([lr])f)$/gi, '$1$2ves'],
  [/(hive)$/gi, '$1s'],
  [/([^aeiouy]|qu)y$/gi, '$1ies'],
  [/(x|ch|ss|sh)$/gi, '$1es'],
  [/(matr|vert|ind)ix|ex$/gi, '$1ices'],
  [/([m|l])ouse$/gi, '$1ice'],
  [/(kn|w|l)ife$/gi, '$1ives'],
  [/(quiz)$/gi, '$1zes'],
  [/^goose$/i, 'geese'],
  [/s$/gi, 's'],
  [/([^a-z])$/, '$1'],
  [/$/gi, 's'],
];
const MONGOOSE_UNCOUNTABLE = [
  'advice',
  'energy',
  'excretion',
  'digestion',
  'cooperation',
  'health',
  'justice',
  'labour',
  'machinery',
  'equipment',
  'information',
  'pollution',
  'sewage',
  'paper',
  'money',
  'species',
  'series',
  'rain',
  'rice',
  'fish',
  'sheep',
  'moose',
  'deer',
  'news',
  'expertise',
  'status',
  'media',
];
export function mongooseCollection(model: string): string {
  const s = model.toLowerCase();
  if (MONGOOSE_UNCOUNTABLE.includes(s)) return s;
  for (const [re, rep] of MONGOOSE_RULES) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      return s.replace(re, rep);
    }
  }
  return s;
}

/**
 * inflection 1.13.4 `pluralize` (used by Sequelize 6 `Utils.pluralize`): a word that already
 * looks plural is kept, otherwise the first singular rule that matches is applied.
 */
const INFLECTION_KEEP: RegExp[] = [
  /^(m|wom)en$/i,
  /(pe)ople$/i,
  /(child)ren$/i,
  /([ti])a$/i,
  /((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i,
  /(database)s$/i,
  /(drive)s$/i,
  /(hi|ti)ves$/i,
  /(curve)s$/i,
  /([lr])ves$/i,
  /([^fo])ves$/i,
  /([^aeiouy]|qu)ies$/i,
  /(s)eries$/i,
  /(m)ovies$/i,
  /(x|ch|ss|sh)es$/i,
  /([m|l])ice$/i,
  /(bus)es$/i,
  /(o)es$/i,
  /(shoe)s$/i,
  /(cris|ax|test)es$/i,
  /(octop|vir)uses$/i,
  /(alias|canvas|status|campus)es$/i,
  /^(summons|bonus)es$/i,
  /^(ox)en/i,
  /(matr)ices$/i,
  /^feet$/i,
  /^teeth$/i,
  /^geese$/i,
  /(quiz)zes$/i,
  /^(whereas)es$/i,
  /^(criteri)a$/i,
  /^genera$/i,
];
const INFLECTION_RULES: Rule[] = [
  [/^(m|wom)an$/i, '$1en'],
  [/(pe)rson$/i, '$1ople'],
  [/(child)$/i, '$1ren'],
  [/(drive)$/i, '$1s'],
  [/^(ox)$/i, '$1en'],
  [/(ax|test)is$/i, '$1es'],
  [/(octop|vir)us$/i, '$1uses'],
  [/(alias|status|canvas|campus)$/i, '$1es'],
  [/^(summons|bonus)$/i, '$1es'],
  [/(bu)s$/i, '$1ses'],
  [/(buffal|tomat|potat)o$/i, '$1oes'],
  [/([ti])um$/i, '$1a'],
  [/sis$/i, 'ses'],
  [/(?:([^f])fe|([lr])f)$/i, '$1$2ves'],
  [/(hi|ti)ve$/i, '$1ves'],
  [/([^aeiouy]|qu)y$/i, '$1ies'],
  [/(matr)ix$/i, '$1ices'],
  [/(vert|ind)ex$/i, '$1ices'],
  [/(x|ch|ss|sh)$/i, '$1es'],
  [/([m|l])ouse$/i, '$1ice'],
  [/^foot$/i, 'feet'],
  [/^tooth$/i, 'teeth'],
  [/^goose$/i, 'geese'],
  [/(quiz)$/i, '$1zes'],
  [/^(whereas)$/i, '$1es'],
  [/^(criteri)on$/i, '$1a'],
  [/^genus$/i, 'genera'],
  [/s$/i, 's'],
  [/$/, 's'],
];
/** inflection 1.13.4's uncountable words (the 291-word list). */
const INFLECTION_UNCOUNTABLE = new Set(
  'access accommodation adulthood advertising advice aggression aid air aircraft alcohol anger applause arithmetic art assistance athletics attention bacon baggage ballet beauty beef beer behavior biology billiards blood botany bowels bread business butter carbon cardboard cash chalk chaos chess crossroads countryside damage dancing danger deer delight dessert dignity dirt distribution dust economics education electricity employment energy engineering enjoyment entertainment envy equipment ethics evidence evolution failure faith fame fiction fish flour flu food freedom fruit fuel fun funeral furniture gallows garbage garlic gas genetics glass gold golf gossip grass gratitude grief ground guilt gymnastics hair happiness hardware harm hate hatred health heat height help homework honesty honey hospitality housework humour hunger hydrogen ice importance inflation information injustice innocence intelligence iron irony jam jealousy jelly jewelry joy judo juice justice karate kindness knowledge labour lack land laughter lava leather leisure lightning linguine linguini linguistics literature litter livestock logic loneliness love luck luggage macaroni machinery magic mail management mankind marble mathematics mayonnaise measles meat metal methane milk minus money moose mud music mumps nature news nitrogen nonsense nurture nutrition obedience obesity oil oxygen paper passion pasta patience permission physics poetry pollution poverty power pride production progress pronunciation psychology publicity punctuation quality quantity quartz racism rain recreation relaxation reliability research respect revenge rice rubbish rum safety salad salt sand satire scenery seafood seaside series shame sheep shopping silence sleep slang smoke smoking snow soap software soil sorrow soup spaghetti speed species spelling sport steam strength stuff stupidity success sugar sunshine symmetry tea tennis thirst thunder timber time toast tolerance trade traffic transportation travel trust understanding underwear unemployment unity usage validity veal vegetation vegetarianism vengeance violence vision vitality warmth water wealth weather weight welfare wheat whiskey width wildlife wine wisdom wood wool work yeast yoga zinc zoology'.split(
    ' ',
  ),
);
export function sequelizePlural(word: string): string {
  if (INFLECTION_UNCOUNTABLE.has(word.toLowerCase())) return word;
  if (INFLECTION_KEEP.some((re) => re.test(word))) return word;
  for (const [re, rep] of INFLECTION_RULES) if (re.test(word)) return word.replace(re, rep);
  return word;
}

/** Laravel's `Str::plural` follows Doctrine Inflector; Rails's rules agree on regular nouns. */
export const laravelPlural = railsPlural;

/** Plain snake case for a camelCase or PascalCase name (`OrderItem` → `order_item`). */
export const snake = railsUnderscore;

/** Rails 8 singular rules (ActiveSupport inflections), applied last first. */
const RAILS_SINGULAR: Rule[] = [
  [/s$/i, ''],
  [/(ss)$/i, '$1'],
  [/(n)ews$/i, '$1ews'],
  [/([ti])a$/i, '$1um'],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, '$1sis'],
  [/(^analy)(sis|ses)$/i, '$1sis'],
  [/([^f])ves$/i, '$1fe'],
  [/(hive)s$/i, '$1'],
  [/(tive)s$/i, '$1'],
  [/([lr])ves$/i, '$1f'],
  [/([^aeiouy]|qu)ies$/i, '$1y'],
  [/(s)eries$/i, '$1eries'],
  [/(m)ovies$/i, '$1ovie'],
  [/(x|ch|ss|sh)es$/i, '$1'],
  [/^(m|l)ice$/i, '$1ouse'],
  [/(bus)(es)?$/i, '$1'],
  [/(o)es$/i, '$1'],
  [/(shoe)s$/i, '$1'],
  [/(cris|test)(is|es)$/i, '$1is'],
  [/^(a)x[ie]s$/i, '$1xis'],
  [/(octop|vir)(us|i)$/i, '$1us'],
  [/(alias|status)(es)?$/i, '$1'],
  [/^(ox)en/i, '$1'],
  [/(vert|ind)ices$/i, '$1ex'],
  [/(matr)ices$/i, '$1ix'],
  [/(quiz)zes$/i, '$1'],
  [/(database)s$/i, '$1'],
];
export function railsSingular(word: string): string {
  const lower = word.toLowerCase();
  if (RAILS_UNCOUNTABLE.some((u) => lower === u || lower.endsWith(`_${u}`))) return word;
  for (const [one, many] of RAILS_IRREGULAR) {
    const re = new RegExp(`(^|_)${many}$`, 'i');
    if (re.test(word)) return word.replace(re, `$1${one}`);
  }
  for (let i = RAILS_SINGULAR.length - 1; i >= 0; i--) {
    const [re, rep] = RAILS_SINGULAR[i]!;
    if (re.test(word))
      return word.replace(re, (...m: string[]) =>
        rep.replace(/\$(\d)/g, (_x, d: string) => m[Number(d)] ?? ''),
      );
  }
  return word;
}
