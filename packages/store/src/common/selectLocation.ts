/**
 * Class specifies location of element in state data tree
 * It allows to add one State class multiple times in Stata Data tree with different paths
 */
export class SelectLocation {
  constructor(public context: string, public name: string, public path: string, public searchInTree: boolean) {}

  static filterByName(name: string): SelectLocation {
    return new SelectLocation('', name, '', false);
  }
  static filterByPath(path: string): SelectLocation {
    return new SelectLocation('', '', path, false);
  }

  static filterByContext(context: string, name: string): SelectLocation {
    return new SelectLocation(context, name, '', true);
  }
  static filterByPathTree(path: string, name: string): SelectLocation {
    return new SelectLocation('', name, path, true);
  }
  static filterByAll(context: string, path: string, name: string): SelectLocation {
    return new SelectLocation(context, name, path, true);
  }

  validate(): boolean {
    if (this.name === '' && this.path === '' && !this.searchInTree) {
      return false;
    }
    if (this.searchInTree && this.context === '' && this.path === '') {
      return false;
    }
    return true;
  }
}
