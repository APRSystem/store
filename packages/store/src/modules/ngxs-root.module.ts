import { Inject, NgModule, Optional } from '@angular/core';

import { InitState } from '../actions/actions';
import { SelectFactory } from '../decorators/select/select-factory';
import {
  globalSelectorOptions,
  StateClassInternal,
  StatesAndDefaults
} from '../internal/internals';
import { LifecycleStateManager } from '../internal/lifecycle-state-manager';
import { StateFactory } from '../internal/state-factory';
import { InternalStateOperations } from '../internal/state-operations';
import { setIvyEnabledInDevMode } from '../ivy/ivy-enabled-in-dev-mode';
import { Store } from '../store';
import { NgxsConfig, ROOT_STATE_TOKEN } from '../symbols';

/**
 * Root module
 * @ignore
 */
@NgModule()
export class NgxsRootModule {
  constructor(
    factory: StateFactory,
    internalStateOperations: InternalStateOperations,
    _store: Store,
    _select: SelectFactory,
    @Optional()
    @Inject(ROOT_STATE_TOKEN)
    states: StateClassInternal[] = [],
    config: NgxsConfig,
    lifecycleStateManager: LifecycleStateManager
  ) {
    // Validate states on having the `@Injectable()` decorator in Ivy
    setIvyEnabledInDevMode();

    globalSelectorOptions.set(config.selectorOptions || {});

    // Add stores to the state graph and return their defaults
    const results: StatesAndDefaults = factory.addAndReturnDefaults(states);

    internalStateOperations.setStateToTheCurrentWithNew(results);

    // Connect our actions stream
    factory.connectActionHandlers();

    // Dispatch the init action and invoke init and bootstrap functions after
    lifecycleStateManager.ngxsBootstrap(new InitState(), results);
  }
}
