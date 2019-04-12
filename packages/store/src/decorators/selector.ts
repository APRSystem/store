import { createSelector } from '../utils/selector-utils';
import { ensureStoreMetadata, ensureSelectorMetadata } from '../internal/internals';

/**
 * Decorator for memoizing a state selector.
 */
export function Selector(selectors?: any[]) {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    if (descriptor.value !== null) {
      const originalFn = descriptor.value;

      const memoizedFn = createSelector(
        selectors,
        originalFn,
        { containerClass: target, selectorName: methodName }
      );

      const meta = ensureStoreMetadata(target);
      const selectorMetaData = ensureSelectorMetadata(memoizedFn);
      if (!meta.selectors[selectorMetaData.selectorName]) {
        meta.selectors[selectorMetaData.selectorName] = selectorMetaData;
      }
      return {
        configurable: true,
        get() {
          return memoizedFn;
        }
      };
    } else {
      throw new Error('Selectors only work on methods');
    }
  };
}
