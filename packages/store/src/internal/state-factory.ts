import { Injectable, Injector, Optional, SkipSelf, isDevMode } from '@angular/core';
import { forkJoin, from, Observable, of, throwError } from 'rxjs';
import { catchError, defaultIfEmpty, filter, map, mergeMap, shareReplay, takeUntil } from 'rxjs/operators';
import { ActionContext, ActionStatus, InternalActions } from '../actions-stream';
import { NgxsAction } from '../actions/base.action';
import { NGXS_MAIN_CONTEXT } from '../common/consts';
import { SelectLocation } from '../common/selectLocation';
import { InternalDispatchedActionResults } from '../internal/dispatcher';
import { StateContextFactory } from '../internal/state-context-factory';
import { ofActionDispatched } from '../operators/of-action';
import { META_KEY, NgxsConfig, NgxsLifeCycle } from '../symbols';
import { getActionTypeFromInstance, setValue } from '../utils/utils';
import {
  buildGraph,
  findFullParentPath,
  getStoreMetadata,
  isObject,
  MappedStore,
  nameToState,
  propGetter,
  // SelectFromState,
  StateClass,
  StateLocation,
  topologicalSort
} from './internals';
// import { InternalStateOperations } from './state-operations';
import { ActionKind } from '../common/enums';

/**
 * State factory class
 * @ignore
 */
@Injectable()
export class StateFactory {
  get states(): MappedStore[] {
    return this._parentFactory ? this._parentFactory.states : this._states;
  }

  private _states: MappedStore[] = [];
  private _connected = false;

  constructor(
    private _injector: Injector,
    private _config: NgxsConfig,
    @Optional()
    @SkipSelf()
    private _parentFactory: StateFactory,
    private _actions: InternalActions,
    private _actionResults: InternalDispatchedActionResults,
    private _stateContextFactory: StateContextFactory,
    // private _internalStateOperations: InternalStateOperations
  ) {}

  /**
   * Add a new state to the global defs.
   */
  add(oneOrManyStateClasses: StateClass | StateClass[]): MappedStore[] {
    let stateClasses: StateClass[];
    if (!Array.isArray(oneOrManyStateClasses)) {
      stateClasses = [oneOrManyStateClasses];
    } else {
      stateClasses = oneOrManyStateClasses;
    }

    const stateGraph = buildGraph(stateClasses);
    const sortedStates = topologicalSort(stateGraph);
    const depths = findFullParentPath(stateGraph);
    const nameGraph = nameToState(stateClasses);
    const mappedStores: MappedStore[] = [];

    for (const name of sortedStates) {
      const stateClass = nameGraph[name];

      if (!stateClass[META_KEY]) {
        throw new Error('States must be decorated with @State() decorator');
      }

      const depth = depths[name];
      const { actions, selectors } = stateClass[META_KEY]!;
      let { defaults } = stateClass[META_KEY]!;

      stateClass[META_KEY]!.path = depth;
      stateClass[META_KEY]!.selectFromAppState = propGetter(depth.split('.'), this._config);
      const depthSplitted = depth.split('.');
      const depthCount = depthSplitted.length;
      let parentName = '';
      if (depthCount > 1) {
        parentName = depthSplitted[depthCount - 2];
      }

      const stateLocation: StateLocation = {
        context: NGXS_MAIN_CONTEXT,
        name: name,
        path: depth,
        parentName: parentName
      };
      stateClass[META_KEY]!.selectsFromAppState.set(stateLocation, propGetter(depth.split('.'), this._config));

      // ensure our store hasn't already been added
      // but dont throw since it could be lazy
      // loaded from different paths
      const has = this.states.find(s => s.name === name);
      if (!has) {
        // create new instance of defaults
        if (Array.isArray(defaults)) {
          defaults = [...defaults];
        } else if (isObject(defaults)) {
          defaults = { ...defaults };
        } else if (defaults === undefined) {
          defaults = {};
        }

        const instance = this._injector.get(stateClass);

        mappedStores.push({
          actions,
          selectors,
          instance,
          defaults,
          name,
          depth,
          context: NGXS_MAIN_CONTEXT
        });
      }
    }

    this.states.push(...mappedStores);

    return mappedStores;
  }

  /**
   * Add a set of states to the store and return the defaulsts
   */
  addAndReturnDefaults(stateClasses: any[]): { defaults: any; states: MappedStore[] } | undefined {
    if (stateClasses) {
      const states = this.add(stateClasses);
      const defaults = states.reduce((result: any, meta: MappedStore) => setValue(result, meta.depth, meta.defaults), {});
      return { defaults, states };
    }
    return undefined;
  }

  /**
   * Bind the actions to the handlers
   */
  connectActionHandlers() {
    if (this._connected) {
      return;
    }
    this._actions
      .pipe(
        filter((ctx: ActionContext) => ctx.status === ActionStatus.Dispatched),
        mergeMap(({ action }) =>
          this.invokeActions(this._actions, action!).pipe(
            map(() => {
              const item: ActionContext = {
                action,
                status: ActionStatus.Successful
              };
              return item;
            }),
            defaultIfEmpty(<ActionContext>{ action, status: ActionStatus.Canceled }),
            catchError(error => {
              const er: ActionContext = {
                action,
                status: ActionStatus.Errored,
                error
              };
              return of(er);
            })
          )
        )
      )
      .subscribe(ctx => this._actionResults.next(ctx));
    this._connected = true;
  }

  /**
   * Invoke the init function on the states.
   */
  invokeInit(stateMetadatas: MappedStore[]) {
    for (const metadata of stateMetadatas) {
      const instance: NgxsLifeCycle = metadata.instance;

      if (instance.ngxsOnInit) {
        const stateContext = this.createStateContext(metadata);
        instance.ngxsOnInit(stateContext);
      }
    }
  }

  /**
   * Invoke actions on the states.
   */
  invokeActions(actions$: InternalActions, action: any) {
    const results = [];
    /** Variable to check if action was executed */
    let actionExecuted = false;
    for (const metadata of this.states) {
      const type = getActionTypeFromInstance(action)!;
      const actionMetas = metadata.actions[type];

      if (actionMetas) {
        /** Check if action implements NgxsAction and if store location equals to MappedStore location */
        if (action instanceof NgxsAction) {
          if (action.location) {
            if (!this.checkLocationWithMappedStore(action.location, metadata)) {
              continue;
            }
          }
        }
        for (const actionMeta of actionMetas) {
          const stateContext = this.createStateContext(metadata);
          try {
            let result = metadata.instance[actionMeta.fn](stateContext, action);
            /** set action was executed */
            actionExecuted = true;

            if (result instanceof Promise) {
              result = from(result);
            }

            if (result instanceof Observable) {
              result = result.pipe(
                actionMeta.options.cancelUncompleted
                  ? // todo: TC ofActionDispatched should be used with action class
                    takeUntil(actions$.pipe(ofActionDispatched(action as any)))
                  : map(r => r)
              ); // map acts like a noop
            } else {
              result = of({}).pipe(shareReplay());
            }

            results.push(result);
          } catch (e) {
            if (isDevMode()) {
              throw e;
            }

            results.push(throwError(e));
          }
        }
      }
    }
    /** I action was not executed and is of command kind then log error */
    if (!actionExecuted) {
      if (action instanceof NgxsAction) {
        if (action.kind !== ActionKind.akEvent) {
          if (isDevMode()) {
            console.error('Action ' + action.constructor.name + ' was not executed');
          }
        }
      }
    }

    if (!results.length) {
      results.push(of({}));
    }

    return forkJoin(results);
  }

  /**
   * Create the state context
   */
  private createStateContext(metadata: MappedStore, path?: string) {
    return this._stateContextFactory.createStateContext(metadata, path);
  }

  /** Function returns state data path based on SelectLocation and state metatadata */
  getLocationPath(location: SelectLocation, state: any): string {
    const storeMeta = getStoreMetadata(state);
    if (!location.searchInTree) {
      if (location.name !== '') {
        let result = '';
        Array.from(storeMeta.selectsFromAppState.keys()).some((key: StateLocation) => {
          if (key.name === location.name) result = key.path;
          return result !== '';
        });
        if (isDevMode()) console.error(`Location name: ${location.name} can't be found`);
        return result;
      } else return location.path;
    } else {
      if (location.context !== '') {
        const tmp = this.states.filter(p => p.context === location.context && p.name === location.name);
        return tmp[0].depth;
      }
    }
    throw new Error(`AF Error, wrong get location path`);
  }

  /** Function checks is MappedStore and SelectLocation points to same state data */
  private checkLocationWithMappedStore(location: SelectLocation, mappedStore: MappedStore): boolean {
    if (location.path && location.path === mappedStore.depth) {
      return true;
    }
    if (location.name) {
      if (location.context && (location.name === mappedStore.name && location.context === mappedStore.context)) {
        return true;
      } else {
        if (location.name === mappedStore.name) {
          return true;
        }
      }
    }
    return false;
  }
}
