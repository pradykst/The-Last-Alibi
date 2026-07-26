#[test_only]
module alibi::verdict_native_tests;

use std::unit_test::{assert_eq, destroy};
use sui::clock;

use alibi::alibi;
use alibi::verifier::{Self, VerdictProofReceipt};

const PLAYER: address = @0xA11CE;
const INTEGRATION_HINT: u64 = 9001;
const EUnreachable: u64 = 255;
const TEST_BLOB_ID: u256 =
    23308994573709855642619175826119088931643282545396843698436971920739544859977;
const OTHER_BLOB_ID: u256 =
    73232971686157566821481873965217386899727957463339902141909339126548630902136;

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
    x"9bdcc3b07d45d65a6cd07d4e341bcc27d3b39bf75fbb44ae16993e6983812452"
}

fun yes_verdict_commitment(): vector<u8> {
    x"fe136f6110208a23f4f918dfae160d94195403788f7f3bc9ff8a07f3f9835a13"
}

fun no_verdict_commitment(): vector<u8> {
    x"632e67f90d102885381f5ddf35feb2eb2263bbc37de87818ed49c1d0ca2f7015"
}

fun yes_proof(): vector<u8> {
    x"227edec78755a89bbcbfece2cf82f0ec255092030880461f5436c899db93eda21dec836c0cd68cd04d0fb69168df49b54ae5e5ad28c5536ef46f45fd022d2101bcd586b4534731c0cc1640bee840252a83dbf48b286acd352cd72b1af65f1609589fd36d18caa39967335db73c67beb75c99c660f8401508a0a22272abafb30c"
}

fun no_proof(): vector<u8> {
    x"9f48f96c670ccf6bea853b4db6641c7b4c3e54bef6a26fc081d677e3d26d901e76f2b9a53caad36b75040a02e64be894e980a5bb22f80b53a92df02e7aabc80875de1d787fd356dd389e48781a19c2c25ae83dae6e3d9ce2f99bef6d025cca12425f4e141a1758779871fba817417bef85d5b082b70f41a465ba555bd0c5352f"
}

fun wrong_key_proof(): vector<u8> {
    x"78a2375d2e320e42a0027349eca4162ccbd88b39d82d6de8417825339eca048eb3365d1ae691c8db616382149f740e68656144f4a708935b3fcb2cb6bd8d7e05c0cf6b5d7a7b03e4865b8f4b38f9a528d6163e1adc408d9aa5785f1cd33e4023f1ee9eed09276d641fb237bffac640e0a830b3237da5db3fe210537c6f649d18"
}

fun verifier_identity(): vector<u8> {
    x"04809b4e07e23854492d78f3efbb7b275168b507459d4ff425bd5f99c28451e3"
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
    assert_eq!(encoded, x"106c34916b658b524e34177dd72e90bf000000000000000000000000000000008650db66556e6071c571e241dd848a0900000000000000000000000000000000a8d366f23cf3c0cdf7fcdbe78e60be42000000000000000000000000000000007de84b2e7ebc6f9e4af81a506b538628000000000000000000000000000000009bdcc3b07d45d65a6cd07d4e341bcc2700000000000000000000000000000000d3b39bf75fbb44ae16993e698381245200000000000000000000000000000000fe136f6110208a23f4f918dfae160d9400000000000000000000000000000000195403788f7f3bc9ff8a07f3f9835a1300000000000000000000000000000000");
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
        TEST_BLOB_ID,
        0,
        &test_clock,
        &mut ctx,
    );
    assert_eq!(alibi::pending_expected_verdict_blob_id(&session), TEST_BLOB_ID);
    assert_eq!(*alibi::pending_session_attempt_domain_commitment(&session), domain_commitment());

    let receipt = alibi::verify_verdict_proof(
        &session,
        &level,
        0,
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

#[test, expected_failure(abort_code = 23, location = alibi)]
fun substituted_valid_content_blob_aborts_before_receipt_and_preserves_pending_atomically() {
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

    alibi::start_accusation(
        &mut session,
        &level,
        yes_accusation_commitment(),
        TEST_BLOB_ID,
        0,
        &test_clock,
        &mut ctx,
    );
    assert_eq!(alibi::pending_expected_verdict_blob_id(&session), TEST_BLOB_ID);

    let receipt = alibi::verify_verdict_proof(
        &session,
        &level,
        0,
        yes_verdict_commitment(),
        OTHER_BLOB_ID,
        yes_proof(),
    );
    consume_verified(receipt);
    abort EUnreachable
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
    *proof.borrow_mut(0) = 1;
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
