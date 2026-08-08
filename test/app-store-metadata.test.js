import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const metadataPath = new URL('../ios/AppStore/metadata.fr-FR.md', import.meta.url);

/** @param {string} markdown @param {string} title */
function section(markdown, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(
    new RegExp(`## ${escaped}\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`),
  );
  if (!match?.[1]) throw new Error(`La section « ${title} » doit exister`);
  return match[1].trim();
}

test('les métadonnées App Store respectent les limites Apple', async () => {
  const markdown = await readFile(metadataPath, 'utf8');
  const promotionalText = section(markdown, 'Texte promotionnel');
  const description = section(markdown, 'Description');
  const keywords = section(markdown, 'Mots-clés');

  assert.ok(promotionalText.length <= 170);
  assert.ok(description.length <= 4000);
  assert.ok(Buffer.byteLength(keywords, 'utf8') <= 100);
  assert.ok(keywords.split(',').every((/** @type {string} */ keyword) => keyword.length > 2));
  assert.equal(section(markdown, 'Build'), 'Version 1.0.0 — build 6');
  assert.match(section(markdown, 'Couverture géographique'), /Ne pas joindre de fichier GeoJSON/);
});

test('les URL publiques App Store utilisent HTTPS', async () => {
  const markdown = await readFile(metadataPath, 'utf8');
  for (const title of ['URL d’assistance', 'URL marketing', 'URL de confidentialité']) {
    assert.match(section(markdown, title), /^https:\/\//);
  }
});
