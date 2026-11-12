/**
 * Links calls to the declarations they name, across files, from syntax alone (no type checker).
 * Pure: the caller supplies each file's syntax result and where each of its imports resolved.
 *
 * Every link says how it was found, so nothing is presented as more certain than it is:
 *   observed    the callee is declared in the same file, in the scope the call can see
 *               (a top-level function, or a member of the enclosing class through self/this
 *               or an implicit member call)
 *   inferred    found through an import of this file, the same package folder, a class named as
 *               the receiver, or because it is the only declaration with that name in the
 *               repository for that language; the detail says which
 *   unresolved  no declaration could be chosen (none, or several equally likely)
 * A call is an instantiation when the source says `new`, or when it resolves to a class-like
 * declaration (Python `Cart()`, Kotlin `Cart()`, C++ `Cart{}`).
 */
import builtins from './builtins.json';
import { CONTAINER_KINDS, type SyntaxDecl, type SyntaxResult } from './types';

/** Method names of each dynamic language's built-in types (scripts/builtin-methods.sh). */
const BUILTIN_METHODS: Record<string, ReadonlySet<string>> = {
  Python: new Set(builtins.Python),
  Ruby: new Set(builtins.Ruby),
};

export interface ResolveFile {
  path: string;
  language: string;
  result: SyntaxResult;
  /** For each entry of result.imports, the repository file it resolved to (undefined: external). */
  importTargets: (string | undefined)[];
}

export interface DeclRef {
  file: string;
  decl: number;
}

export interface CallLink {
  file: string;
  /** Index of the calling declaration in that file, or -1 for top-level code. */
  from: number;
  line: number;
  /** The callee as written (collapsed whitespace). */
  callee: string;
  name: string;
  target?: DeclRef;
  kind: 'calls' | 'instantiates';
  confidence: 'observed' | 'inferred' | 'unresolved';
  detail: string;
}

/** Languages where a bare call inside a class body can name a member of that class. */
const IMPLICIT_MEMBER = new Set([
  'Java',
  'Kotlin',
  'Gradle Kotlin DSL',
  'Scala',
  'Groovy',
  'Gradle',
  'C#',
  'C++',
  'Ruby',
  'Solidity',
  'F#',
  'Elixir',
  'Julia',
  'OCaml',
  'Haskell',
  // Sprint L5: a bare call inside a class body may name a member of that class.
  'Dart',
  'Swift',
  'D',
  'Vala',
  'Haxe',
  'ActionScript',
  'Apex',
  'Pascal',
  'Crystal',
  'GDScript',
]);
const SELF = new Set(['self', 'this', '$this', 'Self', 'base', 'super']);
const CALLABLE = new Set(['function', 'method', 'constructor', 'property']);
const CLASSLIKE = new Set(['class', 'struct', 'record', 'object', 'enum']);

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const lastSegment = (s: string) =>
  s
    .split(/\.|::|->|\\/)
    .filter(Boolean)
    .pop() ?? s;

export function resolveCalls(files: ResolveFile[]): CallLink[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  // Name → declarations, per language family (a Go call never resolves to a Java method).
  const byName = new Map<string, DeclRef[]>();
  // Container name → its member declarations (including Go/Rust/C++ receiver methods).
  const members = new Map<string, DeclRef[]>();
  const containersByName = new Map<string, DeclRef[]>();
  const push = (m: Map<string, DeclRef[]>, k: string, v: DeclRef) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  const fam = (lang: string) => FAMILY[lang] ?? lang;
  const decl = (r: DeclRef): SyntaxDecl => byPath.get(r.file)!.result.declarations[r.decl]!;

  for (const f of files) {
    const L = fam(f.language);
    f.result.declarations.forEach((d, i) => {
      const ref = { file: f.path, decl: i };
      push(byName, `${L}\0${d.name}`, ref);
      if (CONTAINER_KINDS.has(d.kind)) push(containersByName, `${L}\0${d.name}`, ref);
      const parent = d.parent !== undefined ? f.result.declarations[d.parent] : undefined;
      if (parent && CONTAINER_KINDS.has(parent.kind))
        push(members, `${L}\0${parent.name}\0${d.name}`, ref);
      if (d.receiver) push(members, `${L}\0${lastSegment(d.receiver)}\0${d.name}`, ref);
    });
  }

  /** The class-like declaration a declaration belongs to: its parent chain, or its receiver. */
  const containerName = (f: ResolveFile, i: number): string | undefined => {
    let d: SyntaxDecl | undefined = f.result.declarations[i];
    while (d) {
      if (d.receiver) return lastSegment(d.receiver);
      const p: SyntaxDecl | undefined =
        d.parent !== undefined ? f.result.declarations[d.parent] : undefined;
      if (p && CONTAINER_KINDS.has(p.kind)) return p.name;
      d = p;
    }
    return undefined;
  };

  /** Prefer a definition over a prototype: the longest one, then the first. */
  const best = (refs: DeclRef[]): DeclRef | undefined => {
    if (refs.length === 0) return undefined;
    if (refs.length === 1) return refs[0];
    const spans = refs.map((r) => {
      const d = decl(r);
      return d.endLine - d.line;
    });
    const max = Math.max(...spans);
    const longest = refs.filter((_, k) => spans[k] === max);
    // Several equally long candidates in the same file: the same thing declared twice (an
    // overload, or a Haskell equation group), so the first is representative.
    if (longest.every((r) => r.file === longest[0]!.file)) return longest[0];
    return undefined;
  };
  const sameFile = (refs: DeclRef[] | undefined, path: string) =>
    (refs ?? []).filter((r) => r.file === path);
  const sameDir = (refs: DeclRef[] | undefined, path: string) =>
    (refs ?? []).filter((r) => r.file !== path && dirOf(r.file) === dirOf(path));
  const callableOrClass = (refs: DeclRef[] | undefined) =>
    (refs ?? []).filter((r) => {
      const k = decl(r).kind;
      return CALLABLE.has(k) || CLASSLIKE.has(k);
    });

  /** `Optional[Store]`, `*Store`, `Box<Store>`, `std::shared_ptr<Store>`, `pkg.Store` → Store. */
  const typeName = (t: string): string | undefined => {
    let x = t
      .trim()
      .replace(/^(const|mut|final|readonly)\s+/, '')
      .replace(/[?!]$/, '');
    x = x.replace(/^[*&]+\s*/, '').replace(/^(?:mut|const)\s+/, '');
    for (let i = 0; i < 4; i++) {
      const w =
        /^(?:[\w.:]*::|[\w.]*\.)?(Option|Optional|Box|Rc|Arc|RefCell|Cell|Mutex|RwLock|unique_ptr|shared_ptr|weak_ptr|Nullable|Ref|Lazy)\s*[<[](.*)[>\]]$/.exec(
          x,
        );
      if (!w) break;
      x = w[2]!.trim();
    }
    x = x.replace(/<.*$/, '').replace(/[*&\s]+$/, '');
    if (/[[\](),|{}]/.test(x)) return undefined; // lists, unions, tuples: no single class
    const last = lastSegment(x);
    return /^[A-Za-z_]\w*$/.test(last) ? last : undefined;
  };
  /** The repository class a type names, as seen from file f; undefined if none or ambiguous. */
  const pickClass = (t: string, f: ResolveFile): DeclRef | undefined => {
    const name = typeName(t);
    if (!name) return undefined;
    const all = (containersByName.get(`${fam(f.language)}\0${name}`) ?? []).filter(
      (r) => decl(r).kind !== 'impl',
    );
    if (!all.length) return undefined;
    return (
      all.find((r) => r.file === f.path) ??
      one(all.filter((r) => dirOf(r.file) === dirOf(f.path))) ??
      one(all)
    );
  };
  /** A member of class `cls` named `name`, or of one of its repository base classes. */
  const memberIn = (
    cls: string,
    name: string,
    seen: Set<string>,
    lang?: string,
  ): { ref: DeclRef; from: string } | undefined => {
    if (seen.has(cls) || seen.size > 8) return undefined;
    seen.add(cls);
    for (const L of lang ? [lang] : [...new Set(files.map((x) => fam(x.language)))]) {
      const m = members.get(`${L}\0${cls}\0${name}`);
      const hit = m && best(m);
      if (hit) return { ref: hit, from: cls };
      for (const c of containersByName.get(`${L}\0${cls}`) ?? [])
        for (const b of decl(c).bases ?? []) {
          const bn = typeName(b.replace(/\(.*$/s, ''));
          const r = bn && memberIn(bn, name, seen, L);
          if (r) return r;
        }
    }
    return undefined;
  };
  const one = (refs: DeclRef[]) => (refs.length === 1 ? refs[0] : undefined);

  const out: CallLink[] = [];
  for (const f of files) {
    const L = fam(f.language);
    const imports = f.result.imports;
    // Names brought in by this file's imports: local name → (target file, declared name, line).
    const importedNames = new Map<string, { file: string; name: string; line: number }>();
    const importedModules = new Map<string, { file: string; line: number }>();
    // Names and modules this file imports from outside the repository (os, fmt, java.util…).
    const externalNames = new Map<string, string>();
    imports.forEach((imp, k) => {
      const target = f.importTargets[k];
      // The name the module is used by: its alias, or the last part of its path or dotted name
      // (`example.com/api/store` → store, `shop.store` → store, `./lib/util.rb` → util).
      const bare = imp.style === 'module' ? imp.spec : imp.spec.replace(/\.[A-Za-z0-9]+$/, '');
      const local =
        imp.alias ??
        bare
          .split(/[/.\\:]+/)
          .filter(Boolean)
          .pop() ??
        bare;
      if (!target) {
        if (!imp.names?.length) externalNames.set(local, imp.spec);
        for (const n of imp.names ?? []) externalNames.set(n.alias ?? n.name, imp.spec);
        return;
      }
      for (const n of imp.names ?? [])
        importedNames.set(n.alias ?? n.name, { file: target, name: n.name, line: imp.line });
      importedModules.set(local, { file: target, line: imp.line });
    });

    const viaImport = (name: string): DeclRef | undefined => {
      const via = importedNames.get(name);
      if (!via) return undefined;
      return best(sameFile(callableOrClass(byName.get(`${L}\0${via.name}`)), via.file));
    };

    const fdecls = f.result.declarations;
    const vars = f.result.vars ?? [];
    const fieldName = (n: string) => /^(?:\$?this->|this\.|self\.|@)(\w+)$/.exec(n)?.[1];
    /** The class-like declaration enclosing declaration i (itself if it is one). */
    const enclosingContainer = (i: number): number => {
      for (let k = i; k >= 0; k = fdecls[k]!.parent ?? -1)
        if (CONTAINER_KINDS.has(fdecls[k]!.kind)) return k;
      return -1;
    };
    const asType = (
      v: { type?: string; init?: string; copyOf?: string; owner: number },
      via: string,
    ): { type: string; declared: boolean; via: string } | undefined => {
      if (v.type) return { type: v.type, declared: true, via };
      if (v.init) return { type: v.init, declared: false, via };
      // `self.store = store` where store is a typed parameter of the same function.
      const p =
        v.copyOf && v.owner >= 0
          ? fdecls[v.owner]!.params?.find(
              (x) => x.name.replace(/^[$&*]+/, '') === v.copyOf!.replace(/^\$/, ''),
            )
          : undefined;
      return p?.type
        ? { type: p.type, declared: true, via: `${via}, from parameter ${p.name}` }
        : undefined;
    };
    /** What the source says the receiver is. */
    const receiverType = (raw: string, from: number, at: number) => {
      const r = raw.replace(/\s+/g, '');
      const fld = fieldName(r);
      const plain = /^\$?([A-Za-z_]\w*)$/.exec(r)?.[1];
      const created = /^\(?new([A-Z_a-z][\w.]*)/.exec(r)?.[1];
      if (created) return { type: created, declared: true, via: 'constructed here' };
      if (plain && from >= 0) {
        for (let k = from; k >= 0; k = fdecls[k]!.parent ?? -1) {
          const d = fdecls[k]!;
          if (CONTAINER_KINDS.has(d.kind)) break;
          if (d.receiverName === plain && d.receiver)
            return { type: d.receiver, declared: true, via: `receiver of ${d.name}` };
          const v = vars
            .filter((x) => x.owner === k && x.name.replace(/^\$/, '') === plain && x.line <= at)
            .pop();
          if (v) return asType(v, `line ${v.line}`);
          const p = d.params?.find((x) => x.name.replace(/^[$&*]+/, '') === plain);
          if (p)
            return p.type
              ? { type: p.type, declared: true, via: `parameter of ${d.name}` }
              : undefined;
        }
      }
      const name = fld ?? plain;
      if (!name || from < 0) return undefined;
      // A field of the enclosing class: declared in its body, or assigned through self/this.
      const cls = enclosingContainer(from);
      const clsName = cls >= 0 ? fdecls[cls]!.name : containerName(f, from);
      const field = vars.find((x) => {
        if (fieldName(x.name) === name) {
          const xc = x.owner >= 0 ? enclosingContainer(x.owner) : -1;
          return (
            (xc >= 0 ? fdecls[xc]!.name : x.owner >= 0 ? containerName(f, x.owner) : undefined) ===
            clsName
          );
        }
        return (
          x.name === name &&
          x.owner >= 0 &&
          x.owner === cls &&
          (fld !== undefined || IMPLICIT_MEMBER.has(f.language))
        );
      });
      return field ? asType(field, `field declared at line ${field.line}`) : undefined;
    };

    for (const c of f.result.calls) {
      const link = (
        target: DeclRef | undefined,
        confidence: CallLink['confidence'],
        detail: string,
      ): CallLink => {
        const isClass = target ? CLASSLIKE.has(decl(target).kind) : false;
        return {
          file: f.path,
          from: c.owner,
          line: c.line,
          callee: c.callee,
          name: c.name,
          ...(target ? { target } : {}),
          kind:
            c.isNew || isClass || (target && decl(target).kind === 'constructor')
              ? 'instantiates'
              : 'calls',
          confidence: target ? confidence : 'unresolved',
          detail,
        };
      };
      const recv = c.receiver?.replace(/^[@$]/, '').trim();
      const owner = c.owner >= 0 ? containerName(f, c.owner) : undefined;
      const memberOf = (cls: string) => members.get(`${L}\0${cls}\0${c.name}`);

      // `new X` / `X.new`: the class itself.
      if (c.isNew) {
        const cls = sameFile(containersByName.get(`${L}\0${c.name}`), f.path);
        const hit =
          best(cls) ??
          best(sameDir(containersByName.get(`${L}\0${c.name}`), f.path)) ??
          viaImport(c.name) ??
          best(containersByName.get(`${L}\0${c.name}`) ?? []);
        out.push(
          hit
            ? link(
                hit,
                hit.file === f.path ? 'observed' : 'inferred',
                hit.file === f.path ? 'class declared in this file' : describe(hit, c.name),
              )
            : link(undefined, 'unresolved', `no repository class named ${c.name}`),
        );
        continue;
      }

      // x.m() where the source says what x is: a parameter or variable with a declared type, a
      // variable holding `new T`, `T{…}` or `T(…)`, or a field of the enclosing class.
      if (c.receiver !== undefined && !SELF.has(recv ?? '')) {
        const t = receiverType(c.receiver, c.owner, c.line);
        if (t) {
          const cls = pickClass(t.type, f);
          if (cls) {
            const found = memberIn(decl(cls).name, c.name, new Set(), L);
            if (found) {
              out.push(
                link(
                  found.ref,
                  'inferred',
                  `${c.receiver} is ${t.declared ? 'declared as' : 'assigned a new'} ${t.type} (${t.via})${found.from !== decl(cls).name ? `; ${c.name} is inherited from ${found.from}` : ''}`,
                ),
              );
            } else
              out.push(
                link(
                  undefined,
                  'unresolved',
                  `${c.receiver} is a ${t.type} (${cls.file}), which declares no ${c.name} in the repository; it may come from a library base class`,
                ),
              );
            continue;
          }
          if (t.declared) {
            out.push(
              link(
                undefined,
                'unresolved',
                `${c.receiver} is a ${t.type} (${t.via}), which is not declared in the repository`,
              ),
            );
            continue;
          }
        }
      }

      // self.m() / this.m() / implicit member call.
      if (owner && (recv === undefined || SELF.has(recv))) {
        const mine = memberOf(owner) ?? [];
        const here = sameFile(mine, f.path);
        const hit = best(here) ?? best(sameDir(mine, f.path)) ?? best(mine);
        if (hit && (recv !== undefined || IMPLICIT_MEMBER.has(f.language))) {
          out.push(
            link(
              hit,
              hit.file === f.path ? 'observed' : 'inferred',
              hit.file === f.path
                ? `member of ${owner}`
                : `member of ${owner} declared in ${hit.file}`,
            ),
          );
          continue;
        }
        if (recv !== undefined) {
          out.push(
            link(
              undefined,
              'unresolved',
              `${owner} has no member ${c.name} in this repository (it may be inherited)`,
            ),
          );
          continue;
        }
      }

      if (recv === undefined) {
        // A function visible in this file: top-level declarations of this file.
        const local = sameFile(callableOrClass(byName.get(`${L}\0${c.name}`)), f.path).filter(
          (r) => {
            const d = decl(r);
            const p = d.parent !== undefined ? f.result.declarations[d.parent] : undefined;
            return !p || !CONTAINER_KINDS.has(p.kind);
          },
        );
        const hitLocal = best(local);
        if (hitLocal) {
          out.push(link(hitLocal, 'observed', 'declared in this file'));
          continue;
        }
        const imported = viaImport(c.name);
        if (imported) {
          const via = importedNames.get(c.name);
          out.push(
            link(imported, 'inferred', `resolved through the import at line ${via?.line ?? '?'}`),
          );
          continue;
        }
        const pkg = best(callableOrClass(sameDir(byName.get(`${L}\0${c.name}`), f.path)));
        if (pkg && SAME_PACKAGE.has(L)) {
          out.push(link(pkg, 'inferred', `declared in the same package (${pkg.file})`));
          continue;
        }
      } else {
        // Module.f(), Class.f(), alias.f().
        const head = recv.split(/\.|::|->|\\/)[0] ?? recv;
        const mod = importedModules.get(head) ?? importedModules.get(recv);
        if (mod) {
          const named = callableOrClass(byName.get(`${L}\0${c.name}`));
          // A Go (or other package-folder) import names a folder: any file in it may declare it.
          const inMod = sameFile(named, mod.file);
          const hit =
            best(inMod) ??
            (SAME_PACKAGE.has(L)
              ? best(named.filter((r) => dirOf(r.file) === dirOf(mod.file)))
              : undefined);
          if (hit) {
            out.push(link(hit, 'inferred', `resolved through the import at line ${mod.line}`));
            continue;
          }
        }
        const clsName = lastSegment(recv);
        const named = importedNames.get(clsName);
        const clsMembers = memberOf(named?.name ?? clsName);
        if (clsMembers?.length && /^[A-Z]/.test(clsName)) {
          const hit = best(sameFile(clsMembers, f.path)) ?? best(clsMembers);
          if (hit) {
            out.push(
              link(
                hit,
                hit.file === f.path ? 'observed' : 'inferred',
                `member of ${clsName}${hit.file === f.path ? '' : ` declared in ${hit.file}`}`,
              ),
            );
            continue;
          }
        }
      }

      // Called on something this file imports from outside the repository: not repository code.
      const head = recv?.split(/\.|::|->|\\/)[0];
      if (recv !== undefined && head && externalNames.has(head) && !importedModules.has(head)) {
        out.push(
          link(
            undefined,
            'unresolved',
            `called on ${head}, imported from ${externalNames.get(head)} (outside the repository)`,
          ),
        );
        continue;
      }
      if (recv === undefined && externalNames.has(c.name)) {
        out.push(
          link(
            undefined,
            'unresolved',
            `${c.name} is imported from ${externalNames.get(c.name)} (outside the repository)`,
          ),
        );
        continue;
      }

      // Last resort: the only declaration with this name in the repository, for this language,
      // among the declarations such a call can reach. `x.f()` reaches members, or a function of
      // a module named like x; a bare `f()` reaches top-level functions and classes (and, where
      // members can be called implicitly, inherited members).
      const isMember = (r: DeclRef) => {
        const d = decl(r);
        const p =
          d.parent !== undefined ? byPath.get(r.file)!.result.declarations[d.parent] : undefined;
        return !!d.receiver || (!!p && CONTAINER_KINDS.has(p.kind));
      };
      const moduleNamed = (r: DeclRef, name: string) => {
        const parts = r.file.replace(/\.[^./]+$/, '').split('/');
        const stem = parts[parts.length - 1];
        const folder = parts[parts.length - 2];
        // Ruby `Helpers` lives in helpers.rb, Python `sessions` in sessions.py.
        const norm = (x: string | undefined) => x?.toLowerCase().replace(/_/g, '');
        const n = norm(name);
        const parent = decl(r).parent;
        const parentDecl =
          parent !== undefined ? byPath.get(r.file)!.result.declarations[parent] : undefined;
        return (
          n === norm(stem) ||
          n === norm(folder) ||
          (parentDecl !== undefined && lastSegment(parentDecl.name) === name)
        );
      };
      // In a statically typed language the receiver's type decides which method runs, and it is
      // not known here (a type checker is needed), so a name match is not offered. In a dynamic
      // language a name match is offered only on a plain name or field, never on a literal, a
      // cast or the result of another call.
      const plainReceiver =
        recv === undefined ||
        /^(?:\$?this->|self\.|this\.|@)?[A-Za-z_]\w*$/.test(recv.replace(/\s+/g, ''));
      if (recv !== undefined && BUILTIN_METHODS[L]?.has(c.name)) {
        out.push(
          link(
            undefined,
            'unresolved',
            `${c.name} is also a method of ${L}'s built-in types; the type of ${recv.length > 40 ? `${recv.slice(0, 40)}…` : recv} is needed to tell which`,
          ),
        );
        continue;
      }
      const reachable = callableOrClass(byName.get(`${L}\0${c.name}`)).filter((r) => {
        if (recv === undefined) return !isMember(r) || IMPLICIT_MEMBER.has(f.language);
        if (isMember(r)) return !STATIC_TYPES.has(L) && plainReceiver;
        const last = lastSegment(recv);
        return /^[A-Za-z_][\w.]*$/.test(recv) && moduleNamed(r, last);
      });
      if (reachable.length === 1) {
        out.push(
          link(
            reachable[0],
            'inferred',
            recv === undefined || isMember(reachable[0]!)
              ? `the only declaration named ${c.name} in the repository that this call can reach; the receiver's type was not checked`
              : `${c.name} in the module ${lastSegment(recv)} (${reachable[0]!.file})`,
          ),
        );
        continue;
      }
      out.push(
        link(
          undefined,
          'unresolved',
          reachable.length
            ? `${reachable.length} declarations named ${c.name} can be reached; the receiver's type is needed to choose`
            : recv !== undefined && STATIC_TYPES.has(L)
              ? `the type of ${recv.length > 40 ? `${recv.slice(0, 40)}…` : recv} is not written in the source; a type checker is needed to resolve ${c.name}`
              : `no reachable declaration named ${c.name} in the repository`,
        ),
      );
    }
  }
  return out;
}

const describe = (r: DeclRef, name: string): string => `${name} declared in ${r.file}`;

/** Languages where the receiver's static type selects the method (after dialect folding). */
const STATIC_TYPES = new Set([
  'Java',
  'Kotlin',
  'Scala',
  'C#',
  'F#',
  'Go',
  'Rust',
  'C',
  'C++',
  'Cuda',
  'Zig',
  'Solidity',
  'OCaml',
  'Haskell',
]);

/** Languages whose files in one folder share a namespace without imports. */
const SAME_PACKAGE = new Set(['Go', 'Java', 'Kotlin', 'Scala', 'C#', 'Groovy', 'Zig', 'Haskell']);
/** Dialects that share declarations. */
const FAMILY: Record<string, string> = {
  'Gradle Kotlin DSL': 'Kotlin',
  Gradle: 'Groovy',
  Starlark: 'Python',
  'Objective-C': 'C',
  Terraform: 'HCL',
};

export interface BaseLink {
  file: string;
  /** The declaring class (index in that file). */
  from: number;
  line: number;
  /** The base as written. */
  base: string;
  target?: DeclRef;
  kind: 'extends' | 'implements';
  confidence: 'observed' | 'inferred' | 'unresolved';
  detail: string;
}

const INTERFACE_KINDS = new Set(['interface', 'trait']);

/**
 * Links each base class or implemented interface to its declaration in the repository: the same
 * file (observed), a name this file imports, the same folder, or the only container with that
 * name in the language (inferred). Bases from outside the repository stay unresolved.
 */
export function resolveBases(files: ResolveFile[]): BaseLink[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const containers = new Map<string, DeclRef[]>();
  const fam = (lang: string) => FAMILY[lang] ?? lang;
  for (const f of files)
    f.result.declarations.forEach((d, i) => {
      if (!CONTAINER_KINDS.has(d.kind) || d.kind === 'impl') return;
      const k = `${fam(f.language)}\0${d.name}`;
      const l = containers.get(k);
      if (l) l.push({ file: f.path, decl: i });
      else containers.set(k, [{ file: f.path, decl: i }]);
    });
  const one = (refs: DeclRef[]) => (refs.length === 1 ? refs[0] : undefined);
  const out: BaseLink[] = [];
  for (const f of files) {
    const imported = new Map<string, { file: string; name: string; line: number }>();
    f.result.imports.forEach((imp, k) => {
      const t = f.importTargets[k];
      if (!t) return;
      for (const n of imp.names ?? [])
        imported.set(n.alias ?? n.name, { file: t, name: n.name, line: imp.line });
      // Java/Kotlin/C#-style `import a.b.Cart` names the class itself.
      imported.set(lastSegment(imp.spec), { file: t, name: lastSegment(imp.spec), line: imp.line });
    });
    f.result.declarations.forEach((d, i) => {
      for (const base of d.bases ?? []) {
        // `Base<T>`, `pkg.Base`, `Base(args)`, `public Base` → Base.
        const bare = lastSegment(
          base
            .replace(/<.*$|\[.*$|\(.*$/s, '')
            .replace(/^(public|private|protected|virtual)\s+/g, '')
            .trim(),
        );
        const all = containers.get(`${fam(f.language)}\0${bare}`) ?? [];
        const self = (r: DeclRef) => !(r.file === f.path && r.decl === i);
        const cands = all.filter(self);
        const via = imported.get(bare);
        let target: DeclRef | undefined;
        let confidence: BaseLink['confidence'] = 'inferred';
        let detail: string;
        const here = cands.filter((r) => r.file === f.path);
        if (here.length) {
          target = here[0];
          confidence = 'observed';
          detail = 'declared in this file';
        } else if (via && cands.some((r) => r.file === via.file)) {
          target = cands.find((r) => r.file === via.file);
          detail = `resolved through the import at line ${via.line}`;
        } else if (one(cands.filter((r) => dirOf(r.file) === dirOf(f.path)))) {
          target = one(cands.filter((r) => dirOf(r.file) === dirOf(f.path)));
          detail = `declared in the same folder (${target!.file})`;
        } else if (one(cands)) {
          target = one(cands);
          detail = `the only declaration named ${bare} in the repository`;
        } else {
          confidence = 'unresolved';
          detail = cands.length
            ? `${cands.length} declarations are named ${bare}`
            : `${bare} is not declared in the repository (a library or framework type)`;
        }
        const t = target ? byPath.get(target.file)!.result.declarations[target.decl]! : undefined;
        const kind: BaseLink['kind'] =
          (t && INTERFACE_KINDS.has(t.kind)) || (!t && d.kind === 'interface')
            ? 'implements'
            : 'extends';
        out.push({
          file: f.path,
          from: i,
          line: d.line,
          base,
          ...(target ? { target } : {}),
          kind: t && INTERFACE_KINDS.has(t.kind) && INTERFACE_KINDS.has(d.kind) ? 'extends' : kind,
          confidence,
          detail,
        });
      }
    });
  }
  return out;
}
