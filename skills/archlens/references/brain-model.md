# Architecture brain model

The architecture brain is one self-contained HTML page that draws a repository as a 3D brain. It is built from a JSON **brain model**. CodeAtlas writes the model from its index; ArchLens can write it by hand from code it has read. `scripts/render-brain.mjs` puts a model into `assets/brain-template.html`.

```bash
node scripts/render-brain.mjs brain-model.json <repo>-brain.html
```

The page opens offline in any browser with WebGL. Without WebGL the lists, search and details still work.

## What the reader sees

- **Lobes.** Frontend at the front, Backend on top, Database below, DevOps at the back, Core & shared in the cerebellum. Clicking a lobe flies inside it.
- **Neurons.** Classes, functions, methods, components, routes, databases, services and settings. Methods sit next to their class.
- **Synapses.** Links between neurons, coloured by kind. Selecting a neuron lights up its links and shows its inputs and output, where its input comes from and where it sends work, each link with its confidence and `file:line`.
- **Recall.** A search box that finds any neuron by name or file.

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
  ],
  "notes": [
    "Read 42 of 180 source files: routes, services and the database layer. UI components were not read.",
  ],
}
```

### Fields

| Field                | Values                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| neuron `kind`        | `class`, `interface`, `function`, `method`, `component`, `route`, `file`, `database`, `service`, `config`                                                                      |
| neuron `region`      | `frontend`, `backend`, `database`, `devops`, `core`. Leave it out to let the page place the neuron from its file path (and its parent).                                        |
| synapse `kind`       | `calls`, `renders`, `extends`, `implements`, `instantiates`, `handles` (route → handler), `accesses_db`, `reads_config`, `writes_config`, `calls_service`, `imports`, `starts` |
| synapse `confidence` | `observed` (you read the call at `file:line`), `inferred` (concluded; say why in `detail`), `unknown`                                                                          |
| `returnsDeclared`    | `true` when the source wrote the return type, `false` when you worked it out                                                                                                   |

Limits: 20,000 neurons and 100,000 synapses. The page drops unknown kinds, duplicate ids and links to missing neurons, and lists what it dropped.

## Rules for a hand-written model

- Every neuron and every synapse must come from code you read in this session. Never add a neuron for a file you did not open.
- `observed` needs a `file` and `line` where the link appears. Dynamic dispatch, dependency injection, event names and string-built URLs are `inferred` at best.
- Use the types written in the source for `params` and `returns`. If a type is not written and you cannot tell, write `unknown`; do not guess.
- Region placement is always an inference. Give `regionReason` when you override the path-based placement.
- Say what you did **not** read in `notes`. The page shows notes under "About this brain".
- Never put secrets, credentials or `.env` values into `doc`, `signature` or `detail`.
- Do not add commit authors or emails.
