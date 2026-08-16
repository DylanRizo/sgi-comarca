import type { PaginatedData } from '@sgi/contracts';

export interface PageInput {
  page: number;
  pageSize: number;
}

export function pageResult<T>(
  items: readonly T[],
  totalItems: number,
  input: PageInput,
): PaginatedData<T> {
  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}

export function pageOffset(input: PageInput): number {
  return (input.page - 1) * input.pageSize;
}
