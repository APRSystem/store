// tslint:disable:unified-signatures
import { Inject, Injectable, Injector, isDevMode, Optional, Type } from '@angular/core';
import { INITIAL_STATE_TOKEN, PlainObject, PlainObjectOf } from '@ngxs/store/internals';
import { Observable, of, Subscription, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, take } from 'rxjs/operators';

import { UpdateState } from './actions/actions';
import { NgxsAction } from './actions/base.action';
import { ActionHandlerMetaData } from './actions/symbols';
import { NGXS_MAIN_CONTEXT } from './common/consts';
import { onDestroyDefined } from './common/interfaces';
import { SelectLocation } from './common/selectLocation';
import { InternalNgxsExecutionStrategy } from './execution/internal-ngxs-execution-strategy';
import {
  getSelectorMetadata,
  isObject,
  MappedStore,
  propGetter,
  SelectorMetaDataModel,
  StateClassInternal,
  StateLocation,
  StateOperations
} from './internal/internals';
import { StateFactory } from './internal/state-factory';
import { InternalStateOperations } from './internal/state-operations';
import { StateStream } from './internal/state-stream';
import { leaveNgxs } from './operators/leave-ngxs';
import { StateToken } from './state-token/state-token';
import { META_KEY, NgxsConfig } from './symbols';
import { getSelectorFn, getSelectorFunction } from './utils/selector-utils';
import { setValue } from './utils/utils';

@Injectable()
export class Store {
  constructor(
    private _stateStream: StateStream,
    private _internalStateOperations: InternalStateOperations,
    private _config: NgxsConfig,
    private _internalExecutionStrategy: InternalNgxsExecutionStrategy,
    private _stateFactory: StateFactory,
    private _injector: Injector,
    @Optional()
    @Inject(INITIAL_STATE_TOKEN)
    initialStateValue: any
  ) {
    this.initStateStream(initialStateValue);
  }

  /**
   * Dispatches event(s).
   */
  dispatch(event: any | any[]): Observable<any> {
    return this._internalStateOperations.getRootStateOperations().dispatch(event);
  }

  /**
   * Selects a slice of data from the store.
   */
  select<T>(selector: (state: any, ...states: any[]) => T): Observable<T>;
  select<T = any>(selector: string | Type<any>): Observable<T>;
  select<T>(selector: StateToken<T>): Observable<T>;
  select(selector: any): Observable<any> {
    const selectorFn = getSelectorFn(selector);
    return this._stateStream.pipe(
      map(selectorFn),
      catchError((err: Error): Observable<never> | Observable<undefined> => {
        // if error is TypeError we swallow it to prevent usual errors with property access
        const { suppressErrors } = this._config.selectorOptions;

        if (err instanceof TypeError && suppressErrors) {
          return of(undefined);
        }

        // rethrow other errors
        return throwError(err);
      }),
      distinctUntilChanged(),
      leaveNgxs(this._internalExecutionStrategy)
    );
  }

  /**
   * Select one slice of data from the store.
   */

  selectOnce<T>(selector: (state: any, ...states: any[]) => T): Observable<T>;
  selectOnce<T = any>(selector: string | Type<any>): Observable<T>;
  selectOnce<T>(selector: StateToken<T>): Observable<T>;
  selectOnce(selector: any): Observable<any> {
    return this.select(selector).pipe(take(1));
  }

  /**
   * Select a snapshot from the state.
   */
  selectSnapshot<T>(selector: (state: any, ...states: any[]) => T): T;
  selectSnapshot<T = any>(selector: string | Type<any>): T;
  selectSnapshot<T>(selector: StateToken<T>): T;
  selectSnapshot(selector: any): any {
    const selectorFn = getSelectorFn(selector);
    return selectorFn(this._stateStream.getValue());
  }

  /**
   * Allow the user to subscribe to the root of the state
   */
  subscribe(fn?: (value: any) => void): Subscription {
    return this._stateStream.pipe(leaveNgxs(this._internalExecutionStrategy)).subscribe(fn);
  }

  /**
   * Return the raw value of the state.
   */
  snapshot(): any {
    return this._internalStateOperations.getRootStateOperations().getState();
  }

  /**
   * Reset the state to a specific point in time. This method is useful
   * for plugin's who need to modify the state directly or unit testing.
   */
  reset(state: any) {
    return this._internalStateOperations.getRootStateOperations().setState(state);
  }

  private initStateStream(initialStateValue: any): void {
    const value: PlainObject = this._stateStream.value;
    const storeIsEmpty: boolean = !value || Object.keys(value).length === 0;
    if (storeIsEmpty) {
      const defaultStateNotEmpty: boolean = Object.keys(this._config.defaultsState).length > 0;
      const storeValues: PlainObject = defaultStateNotEmpty
        ? { ...this._config.defaultsState, ...initialStateValue }
        : initialStateValue;

      this._stateStream.next(storeValues);
    }
  }

  /**
   * Allows to dispatch action with State Location specified, so we can specifiy on which part of
   * State data tree we want action to work
   */
  dispatchInLocation(
    event: NgxsAction | NgxsAction[],
    location: SelectLocation
  ): Observable<any> {
    if (Array.isArray(event)) {
      event.forEach(evnt => (evnt.location = location));
    } else {
      event.location = location;
    }
    return this._internalStateOperations.getRootStateOperations().dispatch(event);
  }

  /** Allows to select slice of data from the store from specified location */
  selectInContext<T>(
    selector: (state: any, ...states: any[]) => T,
    filter: SelectLocation
  ): Observable<T>;
  selectInContext(selector: string | any, filter: SelectLocation): Observable<any>;
  selectInContext(selector: any, filter: SelectLocation): Observable<any> {
    const selectorFn = getSelectorFn(
      selector,
      this._stateFactory.getLocationPath(filter, selector)
    );
    return this._stateStream.pipe(
      map(selectorFn),
      catchError(err => {
        // if error is TypeError we swallow it to prevent usual errors with property access
        if (err instanceof TypeError) {
          console.error(`AF selector doesn't exist, error: ${err}, ${filter.path}`);
          return of(undefined);
        }
        // rethrow other errors
        throw err;
      }),
      distinctUntilChanged(),
      leaveNgxs(this._internalExecutionStrategy)
    );
  }
  /** Allows to select one slice of data from the store from specified location */
  selectOnceInContext<T>(
    selector: (state: any, ...states: any[]) => T,
    filter: SelectLocation
  ): Observable<T>;
  selectOnceInContext(selector: string | any, filter: SelectLocation): Observable<any>;
  selectOnceInContext(selector: any, filter: SelectLocation): Observable<any> {
    return this.selectInContext(selector, filter).pipe(take(1));
  }

  /**
   * Select a snapshot from the state  from specified location
   */
  selectSnapshotInContext<T>(
    selector: (state: any, ...states: any[]) => T,
    filter: SelectLocation
  ): T;
  selectSnapshotInContext(selector: string | any, filter: SelectLocation): any;
  selectSnapshotInContext(selector: any, filter: SelectLocation): any {
    const selectorFn = getSelectorFn(
      selector,
      this._stateFactory.getLocationPath(filter, selector)
    );
    return selectorFn(this._stateStream.getValue());
  }

  selectInStateContext<T>(
    stateClass: any,
    selector: (state: any, ...states: any[]) => T,
    filter: SelectLocation
  ): Observable<T> {
    const locationPath = this._stateFactory.getLocationPath(filter, selector);
    const state = this._stateFactory.states.find(
      p => p.instance.constructor.name === stateClass.name
    );
    const selectorMData = getSelectorMetadata(selector);
    const selectorMetadata = state!.selectors[selectorMData.selectorName!];

    const selectorFn = getSelectorFunction(selectorMetadata, locationPath);
    return this._stateStream.pipe(
      map(selectorFn),
      catchError(err => {
        // if error is TypeError we swallow it to prevent usual errors with property access
        if (err instanceof TypeError) {
          return of(undefined);
        }
        // rethrow other errors
        throw err;
      }),
      distinctUntilChanged(),
      leaveNgxs(this._internalExecutionStrategy)
    );
  }

  getChildren(stateClass: StateClassInternal): StateClassInternal[] {
    const getChild = (childClass: StateClassInternal) => {
      if (!childClass[META_KEY]) {
        throw new Error('States must be decorated with @State() decorator');
      }
      return childClass;
    };

    const stateClasses = [];
    stateClasses.push(stateClass);
    const { children } = stateClass[META_KEY]!;
    const checkedChildren = (children || []).map(getChild);

    for (const child of checkedChildren) {
      stateClasses.push(...this.getChildren(child));
    }
    return stateClasses;
  }

  addState(state: any) {
    // Since FEATURE_STATE_TOKEN is a multi token, we need to
    // flatten it [[Feature1State, Feature2State], [Feature3State]]
    // const flattenedStates = ([] as any[]).concat(...states);
    const stateClasses = [];
    stateClasses.push(...this.getChildren(state));
    // add stores to the state graph and return their defaults
    const results = this._stateFactory.addAndReturnDefaults(stateClasses);

    const stateOperations = this._internalStateOperations.getRootStateOperations();
    if (results) {
      // get our current stream
      const cur = stateOperations.getState();

      // set the state to the current + new
      stateOperations.setState({ ...cur, ...results.defaults });
    }

    stateOperations.dispatch(new UpdateState()).subscribe(() => {
      // if (results) {
      //   this._stateFactory.invokeInit(results.states);
      // }
    });
  }
  /**
   * Removes state from Store with all of its children
   */
  removeState(stateClass: any) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();

    // get our current stream

    const cur = stateOperations.getState();
    const checkedChildren = this.getChildren(stateClass);
    for (const child of checkedChildren) {
      const { name } = child[META_KEY]!;
      const index = this._stateFactory.states.findIndex(p => p.name === name);
      const state = this._stateFactory.states.find(p => p.name === name);
      if (this.isLastInstance(state!)) {
        if (onDestroyDefined(state)) {
          state.ngxsOnDestory();
        }
      }
      this._stateFactory.states.splice(index, 1);
    }
    const stateName = stateClass[META_KEY].name;
    delete cur[stateName];

    stateOperations.setState({ ...cur });
    stateOperations.dispatch(new UpdateState()).subscribe(() => {});
  }
  /**
   * Removes state from Store with all of its children in given location
   */
  removeStateInLocation(location: SelectLocation) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const cur = stateOperations.getState();
    const states = this._stateFactory.states.filter(p => p.depth.startsWith(location.path));
    states.forEach(state => {
      const index = this._stateFactory.states.findIndex(p => p.depth === state.depth);
      if (this.isLastInstance(state)) {
        if (onDestroyDefined(state)) {
          state.ngxsOnDestory();
        }
      }
      this._stateFactory.states.splice(index, 1);
    });

    stateOperations.setState({ ...cur });
    stateOperations.dispatch(new UpdateState()).subscribe(() => {});
  }

  /**
   * Checks if given state is last instance in Store
   */
  private isLastInstance(state: MappedStore): boolean {
    const states = this._stateFactory.states.filter(p => p.instance === state.instance);
    if (states.length > 1) {
      return false;
    } else {
      return true;
    }
  }
  /**
   * Adds child state in given location
   */
  private addChildInternal(
    parent: string,
    parentType: string,
    child: any,
    childName: string,
    stateOperations: StateOperations<any>,
    location: SelectLocation,
    inPath: boolean = false
  ): MappedStore[] {
    if (location.context === '') {
      location.context = NGXS_MAIN_CONTEXT;
    }
    const cur = stateOperations.getState();
    let parentMetaData;
    let parentNotFound = '';
    if (inPath) {
      parentMetaData = this._stateFactory.states.find(p => p.depth === parent);
      if (!parentMetaData) {
        parentNotFound = `Cannot find parent state in path ${parent} for child state ${childName}`;
      }
    } else {
      if (location.path) {
        parentMetaData = this._stateFactory.states.find(
          p => p.depth.startsWith(location.path) && p.instance.constructor.name === parentType
        );
        if (!parentMetaData) {
          parentNotFound = `Connot find parent ${parentType} state in location path ${location.path} for child state ${childName}`;
        }
      } else {
        parentMetaData = this._stateFactory.states.find(
          p => p.name === parent && p.context === location.context
        );
        if (!parentMetaData) {
          parentNotFound = `Cannot find parent  ${parent} state in context ${location.context} for child state ${childName}`;
        }
      }
    }

    if (!parentMetaData) {
      if (isDevMode()) {
        console.error(parentNotFound);
      } else {
        throw new Error(parentNotFound);
      }
    }
    const mappedStores: MappedStore[] = [];
    const actions: PlainObjectOf<ActionHandlerMetaData[]> = child[META_KEY].actions;
    const selectors: PlainObjectOf<SelectorMetaDataModel> = child[META_KEY].selectors;
    const { defaults } = child[META_KEY];

    const depth = parentMetaData!.depth + '.' + childName;
    child[META_KEY].path = depth;
    child[META_KEY].selectFromAppState = propGetter(depth.split('.'), this._config);

    const stateLocation: StateLocation = {
      context: location.context,
      name: childName,
      path: depth,
      parentName: parent
    };
    child[META_KEY].selectsFromAppState.set(stateLocation, child[META_KEY].selectFromAppState);
    const has = this._stateFactory.states.find(s => s.depth === depth);
    if (has) {
      if (isDevMode()) {
        console.error(`State name: ${childName} already added in location ${depth}`);
      }
    } else {
      let def;
      // create new instance of defaults
      if (Array.isArray(defaults)) {
        def = [...defaults];
      } else if (isObject(defaults)) {
        // def = cloneDeep(defaults);
        def = { ...defaults };
      } else if (defaults === undefined) {
        def = {};
      }

      const instance = this._injector.get(child);

      mappedStores.push({
        actions,
        selectors,
        instance,
        defaults: def,
        name: childName,
        depth,
        context: location.context,
        isInitialised: false
      });

      this._stateFactory.states.push(...mappedStores);

      const newState = setValue(cur, depth, def);
      stateOperations.setState(newState);
      const { children } = child[META_KEY];
      if (children) {
        children.forEach((item: any) => {
          if (inPath) {
            mappedStores.push(
              ...this.addChildInternal(
                depth,
                child.name,
                item,
                item[META_KEY].name,
                stateOperations,
                location,
                inPath
              )
            );
          } else {
            mappedStores.push(
              ...this.addChildInternal(
                childName,
                child.name,
                item,
                item[META_KEY].name,
                stateOperations,
                location,
                inPath
              )
            );
          }
        });
      }
    }
    return mappedStores;
  }

  /**
   * Adds child state with all of its children
   * @param parent Parent state
   * @param child Child state
   */
  addChild(parent: any, child: any, childName?: string, parentName?: string) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const mappedStores: MappedStore[] = [];

    let parentLocalName = '';
    if (parentName) {
      parentLocalName = parentName;
    } else {
      parentLocalName = parent[META_KEY].name;
    }
    if (!childName) {
      childName = child[META_KEY].name;
    }
    const loc = new SelectLocation(NGXS_MAIN_CONTEXT, '', '', false);
    mappedStores.push(
      ...this.addChildInternal(
        parentLocalName,
        parent.name,
        child,
        childName!,
        stateOperations,
        loc
      )
    );

    stateOperations.dispatch(new UpdateState()).subscribe(() => {
      // this._stateFactory.invokeInit(mappedStores);
    });
  }

  /**
   * Adds child state in given context
   */
  addChildInContext(
    parent: any,
    filter: SelectLocation,
    child: any,
    childName?: string,
    parentName?: string
  ) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const mappedStores: MappedStore[] = [];
    const parentMetaData = this._stateFactory.states.filter(
      p => p.context === filter.context && p.instance.constructor.name === parent.name
    );
    let parentLocalName = '';
    if (parentName) {
      parentLocalName = parentName;
    } else {
      if (parentMetaData.length === 1) {
        parentLocalName = parentMetaData[0].name; // parent[META_KEY].name;
      } else if (parentMetaData.length === 0) {
        parentLocalName = parent[META_KEY].name;
      } else {
        if (isDevMode()) {
          console.error(
            `State class ${parent.name} added more than once in context ${filter.context}`
          );
        } else {
          throw new Error(
            `State class ${parent.name} added more than once in context ${filter.context}`
          );
        }
      }
    }
    if (!childName) {
      childName = child[META_KEY].name;
    }
    mappedStores.push(
      ...this.addChildInternal(
        parentLocalName,
        parent.name,
        child,
        childName!,
        stateOperations,
        filter
      )
    );

    stateOperations.dispatch(new UpdateState()).subscribe(() => {
      // this._stateFactory.invokeInit(mappedStores);
    });
  }

  /**
   * Adds child state in given State tree data path
   */
  addChildInPath(child: any, location: SelectLocation, childName?: string) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const mappedStores: MappedStore[] = [];
    if (!childName) {
      childName = child[META_KEY].name;
    }
    mappedStores.push(
      ...this.addChildInternal(
        location.path,
        parent.name,
        child,
        childName!,
        stateOperations,
        location,
        true
      )
    );

    stateOperations.dispatch(new UpdateState()).subscribe(() => {
      // this._stateFactory.invokeInit(mappedStores);
    });
  }

  /**
   * Searches for state with given name added in root path and returns path to that state
   */
  getStateInPath(root: SelectLocation, stateName: string): SelectLocation {
    const state = this._stateFactory.states.find(
      p => p.depth.startsWith(root.path) && p.name === stateName
    );
    if (state) {
      return SelectLocation.filterByPath(state.depth);
    }
    return <any>undefined;
  }
  /**
   * Return state location based on name and parent path
   */
  getState(root: SelectLocation, stateName: string): SelectLocation {
    const path = `${root.path}.${stateName}`;
    const state = this._stateFactory.states.find(p => p.depth === path);
    if (state) {
      return SelectLocation.filterByPath(state.depth);
    }
    return <any>undefined;
  }

  /**
   * Removes State from State Data tree and MappedStores in given location with all its children
   */
  removeStateInPath(location: SelectLocation) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const cur = stateOperations.getState();

    const has = this._stateFactory.states.find(s => s.depth === location.path);
    if (!has) {
      if (isDevMode()) {
        console.error(`State in location ${location.path} dont exists. Cannot delete state`);
      }
    } else {
      const checkedChildren = this._stateFactory.states.filter(p =>
        p.depth.startsWith(has.depth)
      );
      for (const innerChild of checkedChildren) {
        const index = this._stateFactory.states.indexOf(innerChild);
        this._stateFactory.states.splice(index, 1);
      }
      const newState = this.clearValue(cur, has.depth);
      stateOperations.setState({ ...newState });
      stateOperations.dispatch(new UpdateState()).subscribe(() => {});
    }
  }

  /**
   * Removes state by name with all its children
   */
  removeChildByName(childName: string) {
    const stateOperations = this._internalStateOperations.getRootStateOperations();
    const cur = stateOperations.getState();

    const has = this._stateFactory.states.find(s => s.name === childName);
    if (!has) {
      if (isDevMode()) {
        console.error('State of name ' + childName + ' dont exists. Cannot delete state');
      }
    } else {
      const checkedChildren = this._stateFactory.states.filter(p =>
        p.depth.startsWith(has.depth)
      );
      for (const innerChild of checkedChildren) {
        const index = this._stateFactory.states.indexOf(innerChild);
        this._stateFactory.states.splice(index, 1);
      }
      const newState = this.clearValue(cur, has.depth);
      stateOperations.setState({ ...newState });
      stateOperations.dispatch(new UpdateState()).subscribe(() => {});
    }
  }
  removeChild(child: any) {
    this.removeChildByName(child[META_KEY].name);
  }

  /**
   * Changes current working line
   * @param previousLine number of previous line
   * @param currentLine number of current line
   */
  changeCurrentLine(previousLine: string, currentLine: string) {
    this._stateFactory.states
      .filter(p => p.depth.includes(previousLine))
      .forEach(state => {
        if (state.instance) {
          const path: string = state.instance.constructor[META_KEY].path.toString();
          state.instance.constructor[META_KEY].path = path.replace(previousLine, currentLine);
        }
      });
  }

  clearValue = (obj: any, prop: string) => {
    obj = { ...obj };

    const split = prop.split('.');
    const lastIndex = split.length - 1;

    split.reduce((acc, part, index) => {
      if (index === lastIndex) {
        delete acc[part];
      } else {
        acc[part] = { ...acc[part] };
      }

      return acc && acc[part];
    }, obj);

    return obj;
  };
}
