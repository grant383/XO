import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

/** Inventory the actual Next.js Server Actions; do not invent REST endpoints. */
export function generateActionContract() {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (item.name === "actions.ts") files.push(path);
    }
  };
  walk("src/app");
  const actions = files.sort().flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (
      !source.statements.some(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === "use server",
      )
    )
      return [];
    const modules = source.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((value) => value.text)
      .filter((value) => value.startsWith("@/modules/"));
    return source.statements
      .filter(ts.isFunctionDeclaration)
      .filter((declaration) =>
        declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      )
      .map((declaration) => {
        const fields = new Set<string>();
        const visit = (node: ts.Node) => {
          if (ts.isCallExpression(node)) {
            const getter =
              ts.isIdentifier(node.expression) && ["text", "field"].includes(node.expression.text);
            const direct =
              ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "get";
            const argument = node.arguments[getter ? 1 : 0];
            if ((getter || direct) && argument && ts.isStringLiteral(argument))
              fields.add(argument.text);
          }
          ts.forEachChild(node, visit);
        };
        if (declaration.body) visit(declaration.body);
        return {
          name: declaration.name!.text,
          source: file,
          line: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1,
          modules,
          parameters: declaration.parameters.map((parameter) => ({
            name: parameter.name.getText(source),
            type: parameter.type?.getText(source) ?? "inferred",
          })),
          returnType: declaration.type?.getText(source) ?? "inferred",
          literalFormFields: [...fields].sort(),
        };
      });
  });
  return {
    transport: "Next.js Server Actions; internal build-bound transport, not a public REST contract",
    description:
      "Parameters and return annotations are derived from the actual source. Form fields list only literal getters; mapped/dynamic fields and validation are specified by the linked module policies and docs/api/SERVER_ACTIONS.md. Authentication, permission, tenancy and audit checks remain in the existing modules.",
    actions,
  };
}
