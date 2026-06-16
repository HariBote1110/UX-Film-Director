use std::process::ExitCode;

fn main() -> ExitCode {
    match uxfd_shared_memory_spike::run_shm_consumer_from_args(std::env::args().skip(1)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error:?}");
            ExitCode::FAILURE
        }
    }
}
