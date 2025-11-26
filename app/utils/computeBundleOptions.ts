// app/utils/computeBundleOptions.ts

import type {
  ProductWithOptions,
  NormalizedProductOption,
  BundleOptionsResult,
} from '../types/bundles';

function normalizeValues(values: string[] | null | undefined): string[] {
  if (!values) return [];
  const cleaned = values
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  // unique + sorted
  return Array.from(new Set(cleaned)).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

function buildOptionKey(option: NormalizedProductOption): string {
  return `${option.name.trim()}::${option.values.join('|')}`;
}

export function computeBundleOptions(
  products: ProductWithOptions[]
): BundleOptionsResult {
  const result: BundleOptionsResult = {
    sharedOptions: [],
    perProductOptions: {},
  };

  if (!products || products.length === 0) {
    return result;
  }

  const numProducts = products.length;

  const perProductNormalized: Record<string, NormalizedProductOption[]> = {};
  const optionKeyCounts: Record<string, number> = {};

  for (const product of products) {
    const normalizedOptions: NormalizedProductOption[] = (product.options || [])
      .filter((opt) => !!opt && !!opt.name)
      .map((opt) => ({
        name: opt.name.trim(),
        values: normalizeValues(opt.values),
      }));

    perProductNormalized[product.id] = normalizedOptions;

    const seenKeysForThisProduct = new Set<string>();

    for (const opt of normalizedOptions) {
      const key = buildOptionKey(opt);
      if (seenKeysForThisProduct.has(key)) continue;
      seenKeysForThisProduct.add(key);
      optionKeyCounts[key] = (optionKeyCounts[key] || 0) + 1;
    }
  }

  const sharedKeys = new Set<string>();

  if (numProducts > 1) {
    for (const [key, count] of Object.entries(optionKeyCounts)) {
      if (count === numProducts) {
        sharedKeys.add(key);
      }
    }
  }

  const keyToOption: Record<string, NormalizedProductOption> = {};
  for (const opts of Object.values(perProductNormalized)) {
    for (const opt of opts) {
      const key = buildOptionKey(opt);
      if (!keyToOption[key]) {
        keyToOption[key] = opt;
      }
    }
  }

  result.sharedOptions = Array.from(sharedKeys).map(
    (key) => keyToOption[key]
  );

  for (const [productId, opts] of Object.entries(perProductNormalized)) {
    result.perProductOptions[productId] = opts.filter(
      (opt) => !sharedKeys.has(buildOptionKey(opt))
    );
  }

  return result;
}
