module alibi::predicates;

const EInvalidLevel: u64 = 2;
const EUnknownPredicate: u64 = 5;

const SUSPECT_DIMENSION: u8 = 0;
const ROOM_DIMENSION: u8 = 1;
const WEAPON_DIMENSION: u8 = 2;
const TIME_DIMENSION: u8 = 3;

const SUSPECT_COUNT: u8 = 4;
const ROOM_COUNT: u8 = 4;
const WEAPON_COUNT: u8 = 2;
const TIME_COUNT: u8 = 2;
const CASE_COUNT: u8 = 64;
const PREDICATE_COUNT: u8 = 12;
const UNIVERSE_MASK: u64 = 18446744073709551615;

/// Stable numeric representation of one registered equality predicate.
public struct PredicateDefinition has copy, drop, store {
    id: u8,
    dimension: u8,
    value: u8,
    truth_mask: u64,
}

/// Returns the number of registered predicates.
public fun count(): u8 {
    PREDICATE_COUNT
}

/// Returns the number of canonical cases.
public fun case_count(): u8 {
    CASE_COUNT
}

/// Returns the complete 64-case universe mask.
public fun universe_mask(): u64 {
    UNIVERSE_MASK
}

/// Returns a canonical registered predicate by stable numeric identifier.
public fun definition(predicate_id: u8): PredicateDefinition {
    assert!(predicate_id < PREDICATE_COUNT, EUnknownPredicate);
    let (dimension, value) = dimension_and_value(predicate_id);
    PredicateDefinition {
        id: predicate_id,
        dimension,
        value,
        truth_mask: generate_mask(dimension, value),
    }
}

/// Returns a mechanically generated truth mask for a registered predicate.
public fun predicate_mask(predicate_id: u8): u64 {
    definition(predicate_id).truth_mask
}

/// Returns a predicate's stable identifier.
public fun id(predicate: &PredicateDefinition): u8 {
    predicate.id
}

/// Returns a predicate's dimension identifier.
public fun dimension(predicate: &PredicateDefinition): u8 {
    predicate.dimension
}

/// Returns a predicate's dimension-local value identifier.
public fun value(predicate: &PredicateDefinition): u8 {
    predicate.value
}

/// Returns a predicate's mechanically generated truth mask.
public fun truth_mask(predicate: &PredicateDefinition): u64 {
    predicate.truth_mask
}

public(package) fun canonical_predicates(): vector<PredicateDefinition> {
    let predicates = vector::tabulate!(PREDICATE_COUNT as u64, |predicate_id| {
        definition(predicate_id as u8)
    });
    validate(&predicates);
    predicates
}

public(package) fun validate(predicates: &vector<PredicateDefinition>) {
    assert!(predicates.length() == (PREDICATE_COUNT as u64), EInvalidLevel);
    let mut seen = 0u16;
    predicates.do_ref!(|predicate| {
        assert!(predicate.id < PREDICATE_COUNT, EInvalidLevel);
        let identifier_bit = 1u16 << predicate.id;
        assert!((seen & identifier_bit) == 0, EInvalidLevel);
        seen = seen | identifier_bit;

        let (expected_dimension, expected_value) = dimension_and_value(predicate.id);
        assert!(predicate.dimension == expected_dimension, EInvalidLevel);
        assert!(predicate.value == expected_value, EInvalidLevel);
        assert!(valid_dimension_value(predicate.dimension, predicate.value), EInvalidLevel);

        let expected_mask = generate_mask(predicate.dimension, predicate.value);
        assert!(predicate.truth_mask == expected_mask, EInvalidLevel);
        assert!(predicate.truth_mask != 0, EInvalidLevel);
        assert!(predicate.truth_mask != UNIVERSE_MASK, EInvalidLevel);
    });
}

fun dimension_and_value(predicate_id: u8): (u8, u8) {
    if (predicate_id < SUSPECT_COUNT) {
        (SUSPECT_DIMENSION, predicate_id)
    } else if (predicate_id < SUSPECT_COUNT + ROOM_COUNT) {
        (ROOM_DIMENSION, predicate_id - SUSPECT_COUNT)
    } else if (predicate_id < SUSPECT_COUNT + ROOM_COUNT + WEAPON_COUNT) {
        (WEAPON_DIMENSION, predicate_id - SUSPECT_COUNT - ROOM_COUNT)
    } else {
        (TIME_DIMENSION, predicate_id - SUSPECT_COUNT - ROOM_COUNT - WEAPON_COUNT)
    }
}

fun valid_dimension_value(dimension: u8, value: u8): bool {
    (dimension == SUSPECT_DIMENSION && value < SUSPECT_COUNT)
        || (dimension == ROOM_DIMENSION && value < ROOM_COUNT)
        || (dimension == WEAPON_DIMENSION && value < WEAPON_COUNT)
        || (dimension == TIME_DIMENSION && value < TIME_COUNT)
}

fun generate_mask(dimension: u8, value: u8): u64 {
    assert!(valid_dimension_value(dimension, value), EInvalidLevel);
    let mut mask = 0u64;
    let mut suspect = 0u8;
    while (suspect < SUSPECT_COUNT) {
        let mut room = 0u8;
        while (room < ROOM_COUNT) {
            let mut weapon = 0u8;
            while (weapon < WEAPON_COUNT) {
                let mut time = 0u8;
                while (time < TIME_COUNT) {
                    let index = (((suspect * ROOM_COUNT) + room) * WEAPON_COUNT + weapon)
                        * TIME_COUNT + time;
                    let matches = (dimension == SUSPECT_DIMENSION && suspect == value)
                        || (dimension == ROOM_DIMENSION && room == value)
                        || (dimension == WEAPON_DIMENSION && weapon == value)
                        || (dimension == TIME_DIMENSION && time == value);
                    if (matches) {
                        mask = mask | (1u64 << index);
                    };
                    time = time + 1;
                };
                weapon = weapon + 1;
            };
            room = room + 1;
        };
        suspect = suspect + 1;
    };
    mask
}

#[test_only]
public fun definition_for_testing(
    id: u8,
    dimension: u8,
    value: u8,
    truth_mask: u64,
): PredicateDefinition {
    PredicateDefinition {
        id,
        dimension,
        value,
        truth_mask,
    }
}

#[test_only]
public fun validate_for_testing(predicates: &vector<PredicateDefinition>) {
    validate(predicates)
}
