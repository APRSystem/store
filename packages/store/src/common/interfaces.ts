/** If State class implements this interface method ngxsOnDestroy is called when last State class instance is removed from MappedStore */
export interface NgxsOnDestroy {
  ngxsOnDestory(): void;
}

export function onDestroyDefined(instance: any): instance is NgxsOnDestroy {
  return (instance as NgxsOnDestroy).ngxsOnDestory !== undefined;
}
