module sui_pilot_diagnostics::broken;

public fun returns_the_wrong_type(): u64 {
    let value: bool = 1;
    value
}
