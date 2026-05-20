import { axiosGenerator } from "@/features/code-snippets/generators/axiosGenerator";
import { csharpGenerator } from "@/features/code-snippets/generators/csharpGenerator";
import { curlGenerator } from "@/features/code-snippets/generators/curlGenerator";
import { fetchGenerator } from "@/features/code-snippets/generators/fetchGenerator";
import { golangGenerator } from "@/features/code-snippets/generators/golangGenerator";
import { javaGenerator } from "@/features/code-snippets/generators/javaGenerator";
import { nodeGenerator } from "@/features/code-snippets/generators/nodeGenerator";
import { phpGenerator } from "@/features/code-snippets/generators/phpGenerator";
import { pythonGenerator } from "@/features/code-snippets/generators/pythonGenerator";
import { rustGenerator } from "@/features/code-snippets/generators/rustGenerator";
import type { SnippetGenerator, SnippetLanguage } from "@/features/code-snippets/types";

export const snippetGenerators: SnippetGenerator[] = [
  curlGenerator,
  fetchGenerator,
  axiosGenerator,
  nodeGenerator,
  pythonGenerator,
  golangGenerator,
  javaGenerator,
  csharpGenerator,
  phpGenerator,
  rustGenerator,
];

export const snippetGeneratorMap = new Map<SnippetLanguage, SnippetGenerator>(
  snippetGenerators.map((generator) => [generator.meta.id, generator]),
);
