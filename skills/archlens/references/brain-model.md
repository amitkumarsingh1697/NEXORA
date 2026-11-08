# Architecture brain model

The architecture brain is one self-contained HTML page that draws a repository as a 3D brain. It is built from a JSON **brain model**. CodeAtlas writes the model from its index; ArchLens can write it by hand from code it has read. `scripts/render-brain.mjs` puts a model into `assets/brain-template.html`.

```bash
node scripts/render-brain.mjs brain-model.json <repo>-brain.html
```

The page opens offline in any browser with WebGL. Without WebGL the lists, search and details still work.

## What the reader sees

- **Lobes.** Frontend at the front, Backend on top, Database below, DevOps at the back, Core & shared in the cerebellum. Clicking a lobe flies inside it.
- **Neurons.** Classes, functions, methods, components, routes, database tables, databases, services and settings. Methods sit next to their class; tables sit in the Database lobe.
- **Synapses.** Links between neurons, coloured by kind. Selecting a neuron lights up its links and shows its inputs and output, where its input comes from and where it sends work, each link with its confidence and `file:line`.
- **Tables.** Selecting a table lists its columns (type with length or precision and scale, null, primary and foreign keys, default) and the functions that read and write it.
- **Recall.** A search box that finds any neuron by name or file.
- **Diagrams.** The Diagrams button opens an ER diagram (tables, key columns, crow's-foot foreign keys), a schema diagram (every column with its full type) and a class diagram (classes and interfaces with their methods, inputs and return types, and inheritance). Each one can be filtered (by schema file or lobe) and downloaded as SVG. Clicking a box finds it in the brain.

## Format (version 1)

```jsonc
{
  "format": 1,
  "title": "shop — architecture brain",
  "source": {
    "producer": "archlens",
    "repository": "https://github.com/owner/shop",
    "revision": "3f2c9a1", // commit you read, if known
    "generatedAt": "2026-11-08T10:00:00Z",
  },
  "neurons": [
    {
      "id": "server/src/services/cart.ts#CartService",
      "name": "CartService",
      "kind": "class",
      "file": "server/src/services/cart.ts",
      "line": 8,
      "region": "backend", // optional, see below
      "regionReason": "server/services path", // optional
    },
    {
      "id": "server/src/services/cart.ts#CartService.add",
      "name": "CartService.add",
      "kind": "method",
      "parent": "server/src/services/cart.ts#CartService",
      "file": "server/src/services/cart.ts",
      "line": 12,
      "signature": "async add(sku: string, qty = 1): Promise<Cart>",
      "params": [
        { "name": "sku", "type": "string" },
        { "name": "qty", "type": "number", "optional": true },
      ],
      "returns": "Promise<Cart>",
      "returnsDeclared": true,
      "doc": "Adds an item and saves the cart.",
    },
    {
      "id": "table:carts",
      "name": "carts",
      "kind": "table",
      "file": "migrations/0003_carts.sql",
      "line": 1,
      "columns": [
        { "name": "id", "type": "uuid", "nullable": false, "primaryKey": true, "line": 2 },
        {
          "name": "user_id",
          "type": "uuid",
          "nullable": false,
          "references": { "table": "users", "column": "id" },
          "line": 3,
        },
        {
          "name": "total",
          "type": "numeric",
          "precision": 12,
          "scale": 2,
          "nullable": false,
          "default": "0",
          "line": 4,
        },
        { "name": "note", "type": "varchar", "length": 200, "nullable": true, "line": 5 },
      ],
    },
  ],
  "synapses": [
    {
      "source": "server/src/routes/cart.ts#postCart",
      "target": "server/src/services/cart.ts#CartService.add",
      "kind": "calls",
      "confidence": "observed",
      "file": "server/src/routes/cart.ts",
      "line": 21,
    },
    {
      "source": "server/src/services/cart.ts#CartService.add",
      "target": "table:carts",
      "kind": "writes_table",
      "confidence": "observed",
      "file": "server/src/services/cart.ts",
      "line": 15,
      "detail": "db.insert(carts)",
    },
    {
      "source": "table:carts",
      "target": "table:users",
      "kind": "references",
      "confidence": "observed",
      "file": "migrations/0003_carts.sql",
      "line": 3,
    },
  ],
  "notes": [
    "Read 42 of 180 source files: routes, services and the database layer. UI components were not read.",
  ],
}
```

### Fields

| Field                | Values                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| neuron `kind`        | `class`, `interface`, `function`, `method`, `component`, `route`, `file`, `table`, `database` (a client such as Drizzle or pg), `service`, `config`                                                                                                                           |
| neuron `region`      | `frontend`, `backend`, `database`, `devops`, `core`. Leave it out to let the page place the neuron from its file path (and its parent).                                                                                                                                       |
| synapse `kind`       | `calls`, `renders`, `extends`, `implements`, `instantiates`, `handles` (route → handler), `accesses_db`, `reads_config`, `writes_config`, `calls_service`, `imports`, `starts`, `reads_table`, `writes_table` (function → table), `references` (table → table, a foreign key) |
| synapse `confidence` | `observed` (you read the call at `file:line`), `inferred` (concluded; say why in `detail`), `unknown`                                                                                                                                                                         |
| table `columns`      | `name`, `type` as written (`varchar`, `numeric`, `Int`…), `length` or `precision` and `scale` when written, `nullable`, `primaryKey`, `unique`, `default` as written, `references` `{ table, column }`, `line`                                                                |
| `returnsDeclared`    | `true` when the source wrote the return type, `false` when you worked it out                                                                                                                                                                                                  |

Limits: 20,000 neurons, 100,000 synapses and 500 columns per table. The page drops unknown kinds, duplicate ids and links to missing neurons, and lists what it dropped.

## Rules for a hand-written model

- Every neuron and every synapse must come from code you read in this session. Never add a neuron for a file you did not open.
- `observed` needs a `file` and `line` where the link appears. Dynamic dispatch, dependency injection, event names and string-built URLs are `inferred` at best.
- Use the types written in the source for `params` and `returns`. If a type is not written and you cannot tell, write `unknown`; do not guess.
- Tables come only from schema code you read: `CREATE TABLE` / `ALTER TABLE` in SQL and migrations, Prisma `model` blocks, Drizzle `pgTable` / `mysqlTable` / `sqliteTable`, or ORM entity classes. Record each column's type, length, precision, scale, nullability, keys and default exactly as written; leave out anything not written (never fill in database defaults).
- `reads_table` / `writes_table` are `observed` when the code names the table object at that line (`db.select().from(carts)`, `db.insert(carts)`), and `inferred` when you matched a name (a SQL string, `prisma.cart.findMany()`, a repository method name).
- Region placement is always an inference. Give `regionReason` when you override the path-based placement.
- Say what you did **not** read in `notes`. The page shows notes under "About this brain".
- Never put secrets, credentials or `.env` values into `doc`, `signature` or `detail`.
- Do not add commit authors or emails.
