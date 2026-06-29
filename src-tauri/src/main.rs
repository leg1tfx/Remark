#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let initial_file = std::env::args().nth(1);
    remark_lib::run(initial_file)
}
