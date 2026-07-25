pragma circom 2.2.1;

template Smoke() {
    signal input left;
    signal input right;
    signal output product;

    product <== left * right;
}

component main = Smoke();
