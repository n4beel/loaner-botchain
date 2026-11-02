// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {MockNFT} from "./MockNFT.sol";
import {Loaner} from "../../src/Loaner.sol";

contract HostileNFT is MockNFT {
    Loaner public target;
    uint256 public attackListingId;
    bool public attackOnTransfer;

    function setAttack(Loaner _target, uint256 _id) external {
        target = _target;
        attackListingId = _id;
        attackOnTransfer = true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        if (attackOnTransfer && address(target) != address(0)) {
            attackOnTransfer = false;
            // Attempt to reenter giveBack or delist
            target.giveBack(attackListingId);
        }
        super.transferFrom(from, to, tokenId);
    }
}

contract DeceptiveNFT is MockNFT {
    bool public failSilently;

    function setFailSilently(bool _fail) external {
        failSilently = _fail;
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        if (!failSilently) {
            super.transferFrom(from, to, tokenId);
        }
    }
}
