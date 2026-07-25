pragma circom 2.2.1;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "./blake2b_256_120.circom";

function SessionAttemptDomainByte(index) {
    var domain[44] = [
        116, 104, 101, 45, 108, 97, 115, 116, 45, 97, 108,
        105, 98, 105, 58, 58, 118, 101, 114, 100, 105, 99,
        116, 58, 58, 115, 101, 115, 115, 105, 111, 110, 45,
        97, 116, 116, 101, 109, 112, 116, 58, 58, 118, 49
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

template VerdictCircuit() {
    var CASE_DOMAIN = 59645246114738790757125204;
    var ACCUSATION_DOMAIN = 16788644443274716470833820098044729838676;
    var VERDICT_DOMAIN = 1000681195498610548960066585840724;
    var PROTOCOL_VERSION = 1;
    var LEVEL_VERSION = 1;

    signal input case_suspect;
    signal input case_room;
    signal input case_weapon;
    signal input case_time;
    signal input case_salt_low;
    signal input case_salt_high;

    signal input accusation_suspect;
    signal input accusation_room;
    signal input accusation_weapon;
    signal input accusation_time;
    signal input accusation_salt_low;
    signal input accusation_salt_high;

    signal input session_id[32];
    signal input attempt_nonce;
    signal input verdict_blob_id[32];
    signal input verdict_bit;
    signal input verdict_salt_low;
    signal input verdict_salt_high;

    signal output public_inputs[8];

    component caseSuspectBits = Num2Bits(2);
    component caseRoomBits = Num2Bits(2);
    component accusationSuspectBits = Num2Bits(2);
    component accusationRoomBits = Num2Bits(2);
    caseSuspectBits.in <== case_suspect;
    caseRoomBits.in <== case_room;
    accusationSuspectBits.in <== accusation_suspect;
    accusationRoomBits.in <== accusation_room;
    case_weapon * (case_weapon - 1) === 0;
    case_time * (case_time - 1) === 0;
    accusation_weapon * (accusation_weapon - 1) === 0;
    accusation_time * (accusation_time - 1) === 0;
    verdict_bit * (verdict_bit - 1) === 0;

    component equal[4];
    equal[0] = IsEqual();
    equal[0].in[0] <== case_suspect;
    equal[0].in[1] <== accusation_suspect;
    equal[1] = IsEqual();
    equal[1].in[0] <== case_room;
    equal[1].in[1] <== accusation_room;
    equal[2] = IsEqual();
    equal[2].in[0] <== case_weapon;
    equal[2].in[1] <== accusation_weapon;
    equal[3] = IsEqual();
    equal[3].in[0] <== case_time;
    equal[3].in[1] <== accusation_time;
    signal pairMatch[2];
    pairMatch[0] <== equal[0].out * equal[1].out;
    pairMatch[1] <== equal[2].out * equal[3].out;
    verdict_bit === pairMatch[0] * pairMatch[1];

    component caseSalt = CanonicalScalarFromLimbs();
    caseSalt.low <== case_salt_low;
    caseSalt.high <== case_salt_high;
    component accusationSalt = CanonicalScalarFromLimbs();
    accusationSalt.low <== accusation_salt_low;
    accusationSalt.high <== accusation_salt_high;
    component verdictSalt = CanonicalScalarFromLimbs();
    verdictSalt.low <== verdict_salt_low;
    verdictSalt.high <== verdict_salt_high;

    component caseCommitment = Poseidon(8);
    caseCommitment.inputs[0] <== CASE_DOMAIN;
    caseCommitment.inputs[1] <== PROTOCOL_VERSION;
    caseCommitment.inputs[2] <== LEVEL_VERSION;
    caseCommitment.inputs[3] <== case_suspect;
    caseCommitment.inputs[4] <== case_room;
    caseCommitment.inputs[5] <== case_weapon;
    caseCommitment.inputs[6] <== case_time;
    caseCommitment.inputs[7] <== caseSalt.out;

    component accusationCommitment = Poseidon(8);
    accusationCommitment.inputs[0] <== ACCUSATION_DOMAIN;
    accusationCommitment.inputs[1] <== PROTOCOL_VERSION;
    accusationCommitment.inputs[2] <== LEVEL_VERSION;
    accusationCommitment.inputs[3] <== accusation_suspect;
    accusationCommitment.inputs[4] <== accusation_room;
    accusationCommitment.inputs[5] <== accusation_weapon;
    accusationCommitment.inputs[6] <== accusation_time;
    accusationCommitment.inputs[7] <== accusationSalt.out;

    component verdictCommitment = Poseidon(5);
    verdictCommitment.inputs[0] <== VERDICT_DOMAIN;
    verdictCommitment.inputs[1] <== PROTOCOL_VERSION;
    verdictCommitment.inputs[2] <== LEVEL_VERSION;
    verdictCommitment.inputs[3] <== verdict_bit;
    verdictCommitment.inputs[4] <== verdictSalt.out;

    component caseLimbs = CanonicalFieldToLimbs();
    caseLimbs.in <== caseCommitment.out;
    public_inputs[0] <== caseLimbs.low;
    public_inputs[1] <== caseLimbs.high;
    component accusationLimbs = CanonicalFieldToLimbs();
    accusationLimbs.in <== accusationCommitment.out;
    public_inputs[2] <== accusationLimbs.low;
    public_inputs[3] <== accusationLimbs.high;
    component verdictLimbs = CanonicalFieldToLimbs();
    verdictLimbs.in <== verdictCommitment.out;
    public_inputs[6] <== verdictLimbs.low;
    public_inputs[7] <== verdictLimbs.high;

    component sessionBytes[32];
    component verdictBlobBytes[32];
    component nonceBits = Num2Bits(64);
    signal domainPreimageBits[960];
    for (var byte = 0; byte < 32; byte++) {
        sessionBytes[byte] = Num2Bits(8);
        sessionBytes[byte].in <== session_id[byte];
        verdictBlobBytes[byte] = Num2Bits(8);
        verdictBlobBytes[byte].in <== verdict_blob_id[byte];
    }
    nonceBits.in <== attempt_nonce;
    for (var byte = 0; byte < 120; byte++) {
        for (var bit = 0; bit < 8; bit++) {
            if (byte < 44) {
                domainPreimageBits[byte * 8 + bit] <== (SessionAttemptDomainByte(byte) >> bit) & 1;
            } else if (byte < 76) {
                domainPreimageBits[byte * 8 + bit] <== sessionBytes[byte - 44].out[bit];
            } else if (byte < 84) {
                domainPreimageBits[byte * 8 + bit] <== nonceBits.out[(byte - 76) * 8 + bit];
            } else if (byte == 84 || byte == 86) {
                domainPreimageBits[byte * 8 + bit] <== bit == 0 ? 1 : 0;
            } else if (byte < 88) {
                domainPreimageBits[byte * 8 + bit] <== 0;
            } else {
                domainPreimageBits[byte * 8 + bit] <==
                    verdictBlobBytes[byte - 88].out[bit];
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
    public_inputs[4] <== domainLow.out;
    public_inputs[5] <== domainHigh.out;
}

component main = VerdictCircuit();
