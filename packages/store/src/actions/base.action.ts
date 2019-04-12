import { SelectLocation } from '../common/selectLocation';
import { ActionKind } from '../common/enums';

export abstract class NgxsAction {
  location: SelectLocation;
  kind: ActionKind = ActionKind.akCommand;
}
