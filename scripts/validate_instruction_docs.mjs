import { validateInstructionDocs } from "./instruction-routing.mjs";

const { docs, errors } = validateInstructionDocs(process.cwd());

if (errors.length > 0) {
  console.error(`Instruction metadata validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const entrypoints = docs.filter((doc) => doc.metadata.entrypoint).length;
console.log(
  `Instruction metadata validation passed for ${docs.length} routed docs (${entrypoints} entrypoints).`,
);
