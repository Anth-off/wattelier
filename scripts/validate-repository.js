import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const root = process.cwd();
const ignored = new Set(['.git', 'coverage', 'data', 'dist', 'node_modules']);

function filesBelow(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesBelow(target));
    else output.push(target);
  }
  return output;
}

const files = filesBelow(root);
const errors = [];

for (const file of files.filter((candidate) => /\.ya?ml$/i.test(candidate))) {
  try {
    parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)} : YAML invalide (${error.message})`);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith('.md'))) {
  const markdown = fs.readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const pathname = decodeURIComponent(link.split('#')[0]);
    if (!pathname) continue;
    const target = path.resolve(path.dirname(file), pathname);
    if (!fs.existsSync(target)) {
      errors.push(`${path.relative(root, file)} : lien local introuvable « ${link} »`);
    }
  }
}

for (const file of files.filter((candidate) =>
  candidate.includes(`${path.sep}workflows${path.sep}`),
)) {
  const workflow = fs.readFileSync(file, 'utf8');
  for (const match of workflow.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)) {
    if (!/^[a-f0-9]{40}$/.test(match[1])) {
      errors.push(`${path.relative(root, file)} : action non épinglée par SHA (${match[0]})`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('YAML, liens Markdown et références d’actions valides.');
}
