import type {
  IntegrationCatalogItem,
  IntegrationPriceIssue,
  ProductInventoryView,
} from '@sgi/contracts';

// Money is NUMERIC(18,2), so two decimals compare prices exactly: "300" and
// "300.00" are the same price, not a disagreement between warehouses.
function normalizedPrice(value: string): string {
  return Number(value).toFixed(2);
}

/**
 * Projects an inventory read into what an external publisher may see.
 *
 * A product only gets a publishable price when every warehouse that holds it
 * agrees on one and none is flagged for review. Anything else returns
 * `unitPrice: null` with the reason, so the publisher can hold the listing back
 * instead of guessing which price is right.
 */
export function projectCatalogItem(
  view: ProductInventoryView,
): IntegrationCatalogItem {
  const stocked = view.balances.filter(
    (balance) => Number(balance.quantity) > 0,
  );

  let priceIssue: IntegrationPriceIssue | null = null;
  if (
    stocked.length === 0 ||
    stocked.some((balance) => balance.currentUnitPrice === null)
  ) {
    priceIssue = 'MISSING';
  }
  if (stocked.some((balance) => balance.priceReviewRequired)) {
    priceIssue = 'REVIEW';
  }

  let unitPrice: string | null = null;
  if (!priceIssue) {
    const prices = new Set(
      stocked.map((balance) =>
        normalizedPrice(balance.currentUnitPrice as string),
      ),
    );
    if (prices.size === 1) {
      unitPrice = [...prices][0] ?? null;
    } else {
      priceIssue = 'MIXED';
    }
  }

  return {
    code: view.product.code,
    description: view.product.description,
    name: view.product.name,
    priceIssue,
    totalQuantity: view.totalQuantity,
    unitPrice,
  };
}
