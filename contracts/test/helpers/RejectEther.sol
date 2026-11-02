// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Loaner} from "../../src/Loaner.sol";

contract RejectEther {
    Loaner public loaner;

    constructor(Loaner _loaner) {
        loaner = _loaner;
    }

    function withdraw() external {
        loaner.withdraw();
    }

    receive() external payable {
        revert("reject payment");
    }
}
