import { InteractionBase } from "./base/interaction_base.js";
import { commands as serverRentalCommands } from "./server_rental/commands.js";
import { commands as adminCommands } from "./admin/commands.js";

const commands: InteractionBase[] = [
  ...serverRentalCommands,
  ...adminCommands,
  // Add other command group lists here
];

export default commands;
