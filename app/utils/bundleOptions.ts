// app/utils/bundleOptions.ts

export type ProductOption = {
  name: string;
  values: string[];
};

export type BundleItemWithProduct<TProduct = any> = {
  id: string;           // bundleItem id from Prisma
  product: TProduct;    // your Shopify product object
};

export type BundleOption = {
  name: string;
  values: string[];
};

export type ComputedBundleOptions = {
  sharedOptions: BundleOption[];
  perItemOptions: Record<string, BundleOption[]>; // itemId -> options[]
};

function normalizeProductOptions(options: ProductOption[]): ProductOption[] {
  // strip the default "Title / Default Title" noise
  return options.filter((opt) => {
    const name = opt.name.trim().toLowerCase();
    const singleDefault =
      opt.values.length === 1 &&
      opt.values[0].trim().toLowerCase() === "default title";

    return !(name === "title" && singleDefault);
  });
}

function makeOptionKey(opt: ProductOption): string {
  const name = opt.name.trim().toLowerCase();
  const values = [...opt.values].map((v) => v.trim().toLowerCase()).sort();
  return `${name}::${JSON.stringify(values)}`;
}

export function computeBundleOptions(
  items: BundleItemWithProduct[]
): ComputedBundleOptions {
  if (items.length === 0) {
    return { sharedOptions: [], perItemOptions: {} };
  }

  const itemOptionsMap: Record<string, ProductOption[]> = {};
  const optionKeyCounts = new Map<
    string,
    { option: ProductOption; count: number }
  >();

  for (const item of items) {
    // ⚠️ Adjust this to match your product shape:
    // e.g. item.product.options.edges.map(edge => edge.node)
    const rawOptions: ProductOption[] = (item.product.options || []).map(
      (opt: any) => ({
        name: opt.name,
        values: opt.values,
      })
    );

    const normalizedOptions = normalizeProductOptions(rawOptions);
    itemOptionsMap[item.id] = normalizedOptions;

    const seenKeys = new Set<string>();
    for (const opt of normalizedOptions) {
      const key = makeOptionKey(opt);
      if (seenKeys.has(key)) continue; // avoid duplicates from weird data
      seenKeys.add(key);

      const existing = optionKeyCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        optionKeyCounts.set(key, { option: opt, count: 1 });
      }
    }
  }

  const totalItems = items.length;
  const sharedOptions: BundleOption[] = [];
  const sharedKeys = new Set<string>();

  for (const [key, { option, count }] of optionKeyCounts.entries()) {
    if (count === totalItems) {
      sharedKeys.add(key);
      sharedOptions.push({
        name: option.name,
        values: [...option.values],
      });
    }
  }

  const perItemOptions: Record<string, BundleOption[]> = {};

  for (const item of items) {
    const opts = itemOptionsMap[item.id] || [];
    perItemOptions[item.id] = opts
      .filter((opt) => !sharedKeys.has(makeOptionKey(opt)))
      .map((opt) => ({
        name: opt.name,
        values: [...opt.values],
      }));
  }

  return { sharedOptions, perItemOptions };
}
