import load_ticket from "./features/ticket.js";
import load_welcome from "./features/welcome.js";

export default function load() {
    load_ticket();
    load_welcome();
}