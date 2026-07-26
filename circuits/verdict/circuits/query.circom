pragma circom 2.2.1;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "./blake2b_256_120.circom";

function QuerySessionDomainByte(index) {
    var domain[42] = [
        116, 104, 101, 45, 108, 97, 115, 116, 45, 97, 108,
        105, 98, 105, 58, 58, 113, 117, 101, 114, 121, 58,
        58, 115, 101, 115, 115, 105, 111, 110, 45, 99, 111,
        110, 116, 101, 120, 116, 58, 58, 118, 49
    ];
    return domain[index];
}

template CanonicalScalarFromLimbs() {
    signal input low;
    signal input high;
    signal output out;
    component lowBits = Num2Bits(128);
    component highBits = Num2Bits(128);
    component scalar = Bits2Num_strict();
    lowBits.in <== low;
    highBits.in <== high;
    highBits.out[126] === 0;
    highBits.out[127] === 0;
    for (var bit = 0; bit < 128; bit++) {
        scalar.in[bit] <== lowBits.out[bit];
        if (bit < 126) {
            scalar.in[128 + bit] <== highBits.out[bit];
        }
    }
    out <== scalar.out;
}

template CanonicalFieldToLimbs() {
    signal input in;
    signal output low;
    signal output high;
    component bits = Num2Bits_strict();
    component lowValue = Bits2Num(128);
    component highValue = Bits2Num(128);
    bits.in <== in;
    for (var bit = 0; bit < 128; bit++) {
        lowValue.in[bit] <== bits.out[bit];
        if (bit < 126) {
            highValue.in[bit] <== bits.out[128 + bit];
        } else {
            highValue.in[bit] <== 0;
        }
    }
    low <== lowValue.out;
    high <== highValue.out;
}

template QueryCircuit() {
    var CASE_DOMAIN = 59645246114738790757125204;
    var PREDICATE_DOMAIN = 1975982988003200902785731916559921;
    var PROTOCOL_VERSION = 1;
    var LEVEL_VERSION = 1;
    var PREDICATE_DIMENSIONS[12] = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3];
    var PREDICATE_VALUES[12] = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 0, 1];

    signal input case_suspect;
    signal input case_room;
    signal input case_weapon;
    signal input case_time;
    signal input case_salt_low;
    signal input case_salt_high;
    signal input session_id[32];
    signal input level_id[32];
    signal input query_nonce;
    signal input predicate_id;
    signal input predicate_dimension;
    signal input predicate_value;
    signal input result_bit;
    signal output public_inputs[7];

    component caseSuspectBits = Num2Bits(2);
    component caseRoomBits = Num2Bits(2);
    caseSuspectBits.in <== case_suspect;
    caseRoomBits.in <== case_room;
    case_weapon * (case_weapon - 1) === 0;
    case_time * (case_time - 1) === 0;
    result_bit * (result_bit - 1) === 0;

    component predicateIdBits = Num2Bits(4);
    component predicateDimensionBits = Num2Bits(2);
    component predicateValueBits = Num2Bits(2);
    predicateIdBits.in <== predicate_id;
    predicateDimensionBits.in <== predicate_dimension;
    predicateValueBits.in <== predicate_value;
    component predicateMatch[12];
    signal predicateMatchTotal[13];
    signal expectedDimension[13];
    signal expectedValue[13];
    predicateMatchTotal[0] <== 0;
    expectedDimension[0] <== 0;
    expectedValue[0] <== 0;
    for (var predicate = 0; predicate < 12; predicate++) {
        predicateMatch[predicate] = IsEqual();
        predicateMatch[predicate].in[0] <== predicate_id;
        predicateMatch[predicate].in[1] <== predicate;
        predicateMatchTotal[predicate + 1] <== predicateMatchTotal[predicate] + predicateMatch[predicate].out;
        expectedDimension[predicate + 1] <== expectedDimension[predicate] + predicateMatch[predicate].out * PREDICATE_DIMENSIONS[predicate];
        expectedValue[predicate + 1] <== expectedValue[predicate] + predicateMatch[predicate].out * PREDICATE_VALUES[predicate];
    }
    predicateMatchTotal[12] === 1;
    predicate_dimension === expectedDimension[12];
    predicate_value === expectedValue[12];

    component dimensionMatch[4];
    signal dimensionMatchTotal[5];
    signal selectedCaseValue[5];
    dimensionMatchTotal[0] <== 0;
    selectedCaseValue[0] <== 0;
    for (var dimension = 0; dimension < 4; dimension++) {
        dimensionMatch[dimension] = IsEqual();
        dimensionMatch[dimension].in[0] <== predicate_dimension;
        dimensionMatch[dimension].in[1] <== dimension;
        dimensionMatchTotal[dimension + 1] <== dimensionMatchTotal[dimension] + dimensionMatch[dimension].out;
        if (dimension == 0) {
            selectedCaseValue[dimension + 1] <== selectedCaseValue[dimension] + dimensionMatch[dimension].out * case_suspect;
        } else if (dimension == 1) {
            selectedCaseValue[dimension + 1] <== selectedCaseValue[dimension] + dimensionMatch[dimension].out * case_room;
        } else if (dimension == 2) {
            selectedCaseValue[dimension + 1] <== selectedCaseValue[dimension] + dimensionMatch[dimension].out * case_weapon;
        } else {
            selectedCaseValue[dimension + 1] <== selectedCaseValue[dimension] + dimensionMatch[dimension].out * case_time;
        }
    }
    dimensionMatchTotal[4] === 1;
    component predicateResult = IsEqual();
    predicateResult.in[0] <== selectedCaseValue[4];
    predicateResult.in[1] <== predicate_value;
    result_bit === predicateResult.out;

    component caseSalt = CanonicalScalarFromLimbs();
    caseSalt.low <== case_salt_low;
    caseSalt.high <== case_salt_high;
    component caseCommitment = Poseidon(8);
    caseCommitment.inputs[0] <== CASE_DOMAIN;
    caseCommitment.inputs[1] <== PROTOCOL_VERSION;
    caseCommitment.inputs[2] <== LEVEL_VERSION;
    caseCommitment.inputs[3] <== case_suspect;
    caseCommitment.inputs[4] <== case_room;
    caseCommitment.inputs[5] <== case_weapon;
    caseCommitment.inputs[6] <== case_time;
    caseCommitment.inputs[7] <== caseSalt.out;
    component predicateCommitment = Poseidon(6);
    predicateCommitment.inputs[0] <== PREDICATE_DOMAIN;
    predicateCommitment.inputs[1] <== PROTOCOL_VERSION;
    predicateCommitment.inputs[2] <== LEVEL_VERSION;
    predicateCommitment.inputs[3] <== predicate_id;
    predicateCommitment.inputs[4] <== predicate_dimension;
    predicateCommitment.inputs[5] <== predicate_value;

    component caseLimbs = CanonicalFieldToLimbs();
    caseLimbs.in <== caseCommitment.out;
    public_inputs[0] <== caseLimbs.low;
    public_inputs[1] <== caseLimbs.high;
    component predicateLimbs = CanonicalFieldToLimbs();
    predicateLimbs.in <== predicateCommitment.out;
    public_inputs[4] <== predicateLimbs.low;
    public_inputs[5] <== predicateLimbs.high;
    public_inputs[6] <== result_bit;

    component sessionBytes[32];
    component levelBytes[32];
    component nonceBits = Num2Bits(64);
    signal domainPreimageBits[960];
    for (var byte = 0; byte < 32; byte++) {
        sessionBytes[byte] = Num2Bits(8);
        sessionBytes[byte].in <== session_id[byte];
        levelBytes[byte] = Num2Bits(8);
        levelBytes[byte].in <== level_id[byte];
    }
    nonceBits.in <== query_nonce;
    for (var byte = 0; byte < 120; byte++) {
        for (var bit = 0; bit < 8; bit++) {
            if (byte < 42) {
                domainPreimageBits[byte * 8 + bit] <== (QuerySessionDomainByte(byte) >> bit) & 1;
            } else if (byte < 44) {
                domainPreimageBits[byte * 8 + bit] <== 0;
            } else if (byte < 76) {
                domainPreimageBits[byte * 8 + bit] <== sessionBytes[byte - 44].out[bit];
            } else if (byte < 108) {
                domainPreimageBits[byte * 8 + bit] <== levelBytes[byte - 76].out[bit];
            } else if (byte < 116) {
                domainPreimageBits[byte * 8 + bit] <== nonceBits.out[(byte - 108) * 8 + bit];
            } else if (byte == 116 || byte == 118) {
                domainPreimageBits[byte * 8 + bit] <== bit == 0 ? 1 : 0;
            } else {
                domainPreimageBits[byte * 8 + bit] <== 0;
            }
        }
    }
    component domainCommitment = Blake2b256OneBlock120();
    component domainLow = Bits2Num(128);
    component domainHigh = Bits2Num(128);
    for (var bit = 0; bit < 960; bit++) {
        domainCommitment.in[bit] <== domainPreimageBits[bit];
    }
    for (var bit = 0; bit < 128; bit++) {
        domainLow.in[bit] <== domainCommitment.out[bit];
        domainHigh.in[bit] <== domainCommitment.out[bit + 128];
    }
    public_inputs[2] <== domainLow.out;
    public_inputs[3] <== domainHigh.out;
}

component main = QueryCircuit();
