import { SelectLocation } from '../common/selectLocation';
import { ActionKind } from '../common/enums';

/** Base abstract class for Action which lets developer to set SelectLocation and kind of action */
export abstract class NgxsAction {
  location: SelectLocation;
  kind: ActionKind = ActionKind.akCommand;
}
