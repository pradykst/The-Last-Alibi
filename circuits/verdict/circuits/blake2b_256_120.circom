pragma circom 2.2.1;

include "../node_modules/circomlib/circuits/binsum.circom";
include "../node_modules/circomlib/circuits/sha256/rotate.circom";
include "../node_modules/circomlib/circuits/sha256/xor3.circom";

function Blake2bSigma(round, index) {
    var sigma[192] = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
        11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
        7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
        9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
        2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
        12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
        13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
        6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
        10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
    ];
    return sigma[round * 16 + index];
}

template Xor2(n) {
    signal input left[n];
    signal input right[n];
    signal output out[n];

    for (var i = 0; i < n; i++) {
        out[i] <== left[i] + right[i] - 2 * left[i] * right[i];
    }
}

template Blake2bG() {
    signal input a[64];
    signal input b[64];
    signal input c[64];
    signal input d[64];
    signal input x[64];
    signal input y[64];
    signal output outA[64];
    signal output outB[64];
    signal output outC[64];
    signal output outD[64];

    component addA1 = BinSum(64, 3);
    component xorD1 = Xor2(64);
    component rotateD1 = RotR(64, 32);
    component addC1 = BinSum(64, 2);
    component xorB1 = Xor2(64);
    component rotateB1 = RotR(64, 24);
    component addA2 = BinSum(64, 3);
    component xorD2 = Xor2(64);
    component rotateD2 = RotR(64, 16);
    component addC2 = BinSum(64, 2);
    component xorB2 = Xor2(64);
    component rotateB2 = RotR(64, 63);

    for (var i = 0; i < 64; i++) {
        addA1.in[0][i] <== a[i];
        addA1.in[1][i] <== b[i];
        addA1.in[2][i] <== x[i];
    }
    for (var i = 0; i < 64; i++) {
        xorD1.left[i] <== d[i];
        xorD1.right[i] <== addA1.out[i];
    }
    for (var i = 0; i < 64; i++) {
        rotateD1.in[i] <== xorD1.out[i];
    }
    for (var i = 0; i < 64; i++) {
        addC1.in[0][i] <== c[i];
        addC1.in[1][i] <== rotateD1.out[i];
    }
    for (var i = 0; i < 64; i++) {
        xorB1.left[i] <== b[i];
        xorB1.right[i] <== addC1.out[i];
    }
    for (var i = 0; i < 64; i++) {
        rotateB1.in[i] <== xorB1.out[i];
    }
    for (var i = 0; i < 64; i++) {
        addA2.in[0][i] <== addA1.out[i];
        addA2.in[1][i] <== rotateB1.out[i];
        addA2.in[2][i] <== y[i];
    }
    for (var i = 0; i < 64; i++) {
        xorD2.left[i] <== rotateD1.out[i];
        xorD2.right[i] <== addA2.out[i];
    }
    for (var i = 0; i < 64; i++) {
        rotateD2.in[i] <== xorD2.out[i];
    }
    for (var i = 0; i < 64; i++) {
        addC2.in[0][i] <== addC1.out[i];
        addC2.in[1][i] <== rotateD2.out[i];
    }
    for (var i = 0; i < 64; i++) {
        xorB2.left[i] <== rotateB1.out[i];
        xorB2.right[i] <== addC2.out[i];
    }
    for (var i = 0; i < 64; i++) {
        rotateB2.in[i] <== xorB2.out[i];
    }

    for (var i = 0; i < 64; i++) {
        outA[i] <== addA2.out[i];
        outB[i] <== rotateB2.out[i];
        outC[i] <== addC2.out[i];
        outD[i] <== rotateD2.out[i];
    }
}

template Blake2bRound(round) {
    signal input state[16][64];
    signal input message[16][64];
    signal output out[16][64];

    var aIndex[8] = [0, 1, 2, 3, 0, 1, 2, 3];
    var bIndex[8] = [4, 5, 6, 7, 5, 6, 7, 4];
    var cIndex[8] = [8, 9, 10, 11, 10, 11, 8, 9];
    var dIndex[8] = [12, 13, 14, 15, 15, 12, 13, 14];
    component mix[8];
    signal stage[9][16][64];

    for (var word = 0; word < 16; word++) {
        for (var bit = 0; bit < 64; bit++) {
            stage[0][word][bit] <== state[word][bit];
        }
    }

    for (var step = 0; step < 8; step++) {
        mix[step] = Blake2bG();
        for (var bit = 0; bit < 64; bit++) {
            mix[step].a[bit] <== stage[step][aIndex[step]][bit];
            mix[step].b[bit] <== stage[step][bIndex[step]][bit];
            mix[step].c[bit] <== stage[step][cIndex[step]][bit];
            mix[step].d[bit] <== stage[step][dIndex[step]][bit];
            mix[step].x[bit] <== message[Blake2bSigma(round, step * 2)][bit];
            mix[step].y[bit] <== message[Blake2bSigma(round, step * 2 + 1)][bit];
        }

        for (var word = 0; word < 16; word++) {
            for (var bit = 0; bit < 64; bit++) {
                if (word == aIndex[step]) {
                    stage[step + 1][word][bit] <== mix[step].outA[bit];
                } else if (word == bIndex[step]) {
                    stage[step + 1][word][bit] <== mix[step].outB[bit];
                } else if (word == cIndex[step]) {
                    stage[step + 1][word][bit] <== mix[step].outC[bit];
                } else if (word == dIndex[step]) {
                    stage[step + 1][word][bit] <== mix[step].outD[bit];
                } else {
                    stage[step + 1][word][bit] <== stage[step][word][bit];
                }
            }
        }
    }

    for (var word = 0; word < 16; word++) {
        for (var bit = 0; bit < 64; bit++) {
            out[word][bit] <== stage[8][word][bit];
        }
    }
}

template Blake2b256OneBlock120() {
    signal input in[960];
    signal output out[256];

    var initialHash[8] = [
        7640891576939301160,
        13503953896175478587,
        4354685564936845355,
        11912009170470909681,
        5840696475078001361,
        11170449401992604703,
        2270897969802886507,
        6620516959819538809
    ];
    var initialState[16] = [
        7640891576939301160,
        13503953896175478587,
        4354685564936845355,
        11912009170470909681,
        5840696475078001361,
        11170449401992604703,
        2270897969802886507,
        6620516959819538809,
        7640891576956012808,
        13503953896175478587,
        4354685564936845355,
        11912009170470909681,
        5840696475078001321,
        11170449401992604703,
        16175846103906665108,
        6620516959819538809
    ];

    signal message[16][64];
    component rounds[12];
    component digestXor[4];

    for (var bit = 0; bit < 960; bit++) {
        in[bit] * (in[bit] - 1) === 0;
    }
    for (var word = 0; word < 16; word++) {
        for (var bit = 0; bit < 64; bit++) {
            if (word * 64 + bit < 960) {
                message[word][bit] <== in[word * 64 + bit];
            } else {
                message[word][bit] <== 0;
            }
        }
    }

    for (var round = 0; round < 12; round++) {
        rounds[round] = Blake2bRound(round);
        for (var word = 0; word < 16; word++) {
            for (var bit = 0; bit < 64; bit++) {
                rounds[round].message[word][bit] <== message[word][bit];
                if (round == 0) {
                    rounds[round].state[word][bit] <== (initialState[word] >> bit) & 1;
                } else {
                    rounds[round].state[word][bit] <== rounds[round - 1].out[word][bit];
                }
            }
        }
    }

    for (var word = 0; word < 4; word++) {
        digestXor[word] = Xor3(64);
        for (var bit = 0; bit < 64; bit++) {
            digestXor[word].a[bit] <== (initialHash[word] >> bit) & 1;
            digestXor[word].b[bit] <== rounds[11].out[word][bit];
            digestXor[word].c[bit] <== rounds[11].out[word + 8][bit];
        }
        for (var bit = 0; bit < 64; bit++) {
            out[word * 64 + bit] <== digestXor[word].out[bit];
        }
    }
}
