#[test_only]
module alibi::verdict_native_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock;

use alibi::alibi;
use alibi::verifier::{Self, VerdictProofReceipt};

const PLAYER: address = @0xA11CE;
const INTEGRATION_HINT: u64 = 9001;
const EUnreachable: u64 = 255;
const TEST_BLOB_ID: u256 = 1;

fun case_commitment(): vector<u8> {
    x"106c34916b658b524e34177dd72e90bf8650db66556e6071c571e241dd848a09"
}

fun yes_accusation_commitment(): vector<u8> {
    x"a8d366f23cf3c0cdf7fcdbe78e60be427de84b2e7ebc6f9e4af81a506b538628"
}

fun no_accusation_commitment(): vector<u8> {
    x"482aedb759bd52b46dcd27e6a56b7c67d2867cf0bf74dc1d34a3360e9f66432a"
}

fun domain_commitment(): vector<u8> {
    x"1a609d9f368d85a174de6e875d07cf751de7a8fad15926dccf249e29f0acbd27"
}

fun yes_verdict_commitment(): vector<u8> {
    x"fe136f6110208a23f4f918dfae160d94195403788f7f3bc9ff8a07f3f9835a13"
}

fun no_verdict_commitment(): vector<u8> {
    x"632e67f90d102885381f5ddf35feb2eb2263bbc37de87818ed49c1d0ca2f7015"
}

fun yes_proof(): vector<u8> {
    x"b7db83659d3c430b4409000fd12b50239e6076954a1e1dab3d0c623c0bcd9e8d45645defdc19379a471908080697e8a88ba9bb1eb3c3c2f7e5c91ad830e61d1546340211e7e8113320552e85b705a3b9127ccabcc4785cf2e7e3f1972a74d18b59de1a97dd26dc8660d815f185fba08af84598823c3cc7c1ac3bd0f5afba49a0"
}

fun no_proof(): vector<u8> {
    x"f5c63cb9f5f18ff2c455087859056eca198369bc73fb16c53c89cbc7df26c39f512e443fc0b2c8df241e36b5c49a056362fbf35b612261fd45e647f89f4b0b036ca030e42301e6e99da24f2b83f34e63efaa67ce409a281417cdfafabf10d8152b0139aa0c8d2c14b5295587249caa937e3b70b17722d1824614263b0f02c123"
}

fun wrong_key_proof(): vector<u8> {
    x"b8220fcb827123dfb9aabc6caee562041cfdf6033410e6792d1f3f3149cc529953cd2a1c7b2edde007cc266e166dd77f262d912bad14c601d372cbf4644a5b2e522dd62a4638a365585e2fb0edc164472e282dbcfa5534b88b99b35f229423ab7be3703a28eb94cd688eceac78a5f3c71191117c66517d9599a37c32b8aadf05"
}

fun verifier_identity(): vector<u8> {
    x"57413ae2abe8025a6035cca0c5c063687827fcc56bd5f8b11126ba47072fe2c3"
}

fun fixture_session_id(): ID {
    object::id_from_address(@0x815df49979fa951bb38c69b0319a9a6d3af78f43eca3701a696f814e96700999)
}

fun fixture_level_id(): ID {
    object::id_from_address(@0x2)
}

fun consume_verified(receipt: VerdictProofReceipt) {
    let (_, _, _, _, _, _, _, _, _, identity, status) = verifier::consume_verdict(receipt);
    assert_eq!(identity, verifier_identity());
    assert_eq!(status, 1);
}

#[test]
fun valid_yes_proof_succeeds_natively() {
    let receipt = verifier::verify_verdict_proof(
        1,
        fixture_session_id(),
        fixture_level_id(),
        0,
        case_commitment(),
        yes_accusation_commitment(),
        domain_commitment(),
        yes_verdict_commitment(),
        TEST_BLOB_ID,
        yes_proof(),
    );
    consume_verified(receipt);
}

#[test]
fun valid_no_proof_succeeds_natively() {
    let receipt = verifier::verify_verdict_proof(
        1,
        fixture_session_id(),
        fixture_level_id(),
        0,
        case_commitment(),
        no_accusation_commitment(),
        domain_commitment(),
        no_verdict_commitment(),
        TEST_BLOB_ID,
        no_proof(),
    );
    consume_verified(receipt);
}

#[test]
fun move_public_input_bytes_match_the_fixture_exactly() {
    let encoded = verifier::verdict_public_inputs_for_testing(
        case_commitment(),
        yes_accusation_commitment(),
        domain_commitment(),
        yes_verdict_commitment(),
    );
    assert_eq!(encoded, x"106c34916b658b524e34177dd72e90bf000000000000000000000000000000008650db66556e6071c571e241dd848a0900000000000000000000000000000000a8d366f23cf3c0cdf7fcdbe78e60be42000000000000000000000000000000007de84b2e7ebc6f9e4af81a506b538628000000000000000000000000000000001a609d9f368d85a174de6e875d07cf75000000000000000000000000000000001de7a8fad15926dccf249e29f0acbd2700000000000000000000000000000000fe136f6110208a23f4f918dfae160d9400000000000000000000000000000000195403788f7f3bc9ff8a07f3f9835a1300000000000000000000000000000000");
}

#[test]
fun verified_receipt_finalizes_the_matching_pending_attempt() {
    let mut ctx = tx_context::new_from_hint(PLAYER, INTEGRATION_HINT, 0, 0, 0);
    let level = alibi::new_level_for_testing(&mut ctx);
    let mut session = alibi::new_session_for_testing(
        &level,
        alibi::practice_mode_for_testing(),
        case_commitment(),
        alibi::protocol_version_for_testing(),
        alibi::level_version_for_testing(),
        &mut ctx,
    );
    let test_clock = clock::create_for_testing(&mut ctx);
    assert_eq!(object::id(&session), fixture_session_id());
    assert_eq!(*alibi::expected_verdict_verifier_identity(&level), verifier_identity());

    alibi::start_accusation(
        &mut session,
        &level,
        yes_accusation_commitment(),
        0,
        &test_clock,
        &mut ctx,
    );
    assert_eq!(*alibi::pending_session_attempt_domain_commitment(&session), domain_commitment());

    let receipt = verifier::verify_verdict_proof(
        alibi::verdict_receipt_version_for_testing(),
        object::id(&session),
        object::id(&level),
        0,
        case_commitment(),
        yes_accusation_commitment(),
        domain_commitment(),
        yes_verdict_commitment(),
        TEST_BLOB_ID,
        yes_proof(),
    );
    alibi::finalize_verdict(&mut session, &level, receipt, &test_clock);

    assert_eq!(alibi::session_state(&session), alibi::terminal_state_for_testing());
    assert!(!alibi::has_pending_accusation(&session));
    assert!(alibi::has_verdict(&session));
    assert_eq!(*alibi::verdict_commitment(&session), yes_verdict_commitment());
    assert_eq!(*alibi::verdict_verifier_identity(&session), verifier_identity());
    test_clock.destroy_for_testing();
    destroy(session);
    destroy(level);
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun proof_under_another_key_fails() {
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, case_commitment(),
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, wrong_key_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun corrupted_proof_fails() {
    let mut proof = yes_proof();
    *proof.borrow_mut(0) = 0;
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, case_commitment(),
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, proof,
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun reordered_commitments_fail() {
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, yes_accusation_commitment(),
        case_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, yes_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 21, location = verifier)]
fun swapped_case_limbs_fail() {
    let swapped_case = x"8650db66556e6071c571e241dd848a09106c34916b658b524e34177dd72e90bf";
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, swapped_case,
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, yes_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun truncated_proof_fails() {
    let mut proof = yes_proof();
    proof.pop_back();
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, case_commitment(),
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, proof,
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 22, location = verifier)]
fun extended_proof_fails() {
    let mut proof = yes_proof();
    proof.push_back(0);
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, case_commitment(),
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, proof,
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 21, location = verifier)]
fun malformed_commitment_length_fails() {
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, vector[1u8],
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, yes_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
}

#[test, expected_failure(abort_code = 21, location = verifier)]
fun scalar_modulus_encoding_is_rejected_without_reduction() {
    let modulus = x"010000f093f5e1439170b97948e833285d588181b64550b829a031e1724e6430";
    let receipt = verifier::verify_verdict_proof(
        1, fixture_session_id(), fixture_level_id(), 0, modulus,
        yes_accusation_commitment(), domain_commitment(), yes_verdict_commitment(),
        TEST_BLOB_ID, yes_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
}
