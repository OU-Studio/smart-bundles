// app/types/bundles.ts

export type ProductOption = {
  name: string;
  values: string[];
};

export type ProductWithOptions = {
  id: string;
  title: string;
  options: ProductOption[];
};

export type NormalizedProductOption = {
  name: string;
  values: string[]; // sorted, trimmed, unique
};

export type BundleOptionsResult = {
  sharedOptions: NormalizedProductOption[];
  perProductOptions: Record<string, NormalizedProductOption[]>;
};
