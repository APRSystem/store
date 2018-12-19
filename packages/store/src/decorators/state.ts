import { ensureStoreMetadata } from '../internal/internals';
import { StoreOptions, META_KEY } from '../symbols';

const stateNameRegex = new RegExp('^[a-zA-Z0-9_]+$');

/**
 * Error message
 * @ignore
 */
export const stateNameErrorMessage = (name: string) => `${name} is not a valid state name. It needs to be a valid object property name.`;

/**
 * Decorates a class with ngxs state information.
 */
export function State<T>(options: StoreOptions<T>) {
  return function(target: any) {
    const meta = ensureStoreMetadata(target);

    // Handle inheritance
    if (Object.getPrototypeOf(target)) {
      const stateClasses = getInheritanceTree(target);
      for (const stateClass of stateClasses) {
        if (stateClass.hasOwnProperty(META_KEY)) {
          const parentMeta = stateClass[META_KEY];
          meta.actions = {
            ...meta.actions,
            ...parentMeta.actions
          };
        }
      }
    }
    if (options.inheritedActions) {
      for (const action of options.inheritedActions) {
        if (Object.getPrototypeOf(action)) {
          const classes = getInheritanceTree(action);
          for (const actionClass of classes) {
            const baseType = actionClass.type;
            const actionsMeta = meta.actions[baseType];
            if (actionsMeta) {
              for (const actMeta of actionsMeta) {
                if (!meta.actions[action.type]) {
                  meta.actions[action.type] = [];
                }
                meta.actions[action.type].push({
                  fn: actMeta.fn,
                  options: actMeta.options || {},
                  type: action.type
                });
              }
            }
          }
        }
      }
    }

    meta.children = options.children;
    meta.defaults = options.defaults;
    meta.name = options.name;

    if (!options.name) {
      throw new Error(`States must register a 'name' property`);
    }

    if (!stateNameRegex.test(options.name)) {
      throw new Error(stateNameErrorMessage(options.name));
    }
  };
}

/**
 * Get parent all parent classes
 */
export function getInheritanceTree(target: any): any[] {
  const tree = [];
  if (Object.getPrototypeOf(target)) {
    tree.push(Object.getPrototypeOf(target));
    tree.push(...getInheritanceTree(Object.getPrototypeOf(target)));
  }
  return tree;
}
