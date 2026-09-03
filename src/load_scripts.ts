import load_ticket from "./features/ticket.js";
import load_script from "./features/scripts.js";
import load_welcome from "./features/welcome.js";
import load_bots from "./features/bots.js";

export default function load() {
    load_script();
    load_ticket();
    load_welcome();
    load_bots();
}