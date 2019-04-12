
export interface NgxsOnDestroy {
  ngxsOnDestory();
}

export function onDestroyDefined(instance: any): instance is NgxsOnDestroy {
  return (instance as NgxsOnDestroy).ngxsOnDestory !== undefined;
}
