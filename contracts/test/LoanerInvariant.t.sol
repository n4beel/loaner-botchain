// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Loaner} from "../src/Loaner.sol";
import {MockNFT} from "./helpers/MockNFT.sol";

contract LoanerHandler is Test {
    Loaner public loaner;
    MockNFT public nft;

    address[] public actors;
    uint256[] public activeListingIds;

    constructor(Loaner _loaner, MockNFT _nft) {
        loaner = _loaner;
        nft = _nft;

        actors.push(address(0x1111));
        actors.push(address(0x2222));
        actors.push(address(0x3333));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1000 ether);
        }
    }

    function createListing(uint8 actorIdx, uint8 tokenSeed, uint8 daysSeed) external {
        address lender = actors[actorIdx % actors.length];
        uint256 tokenId = uint256(tokenSeed) + 1000;
        uint16 maxDays = uint16((uint256(daysSeed) % 80) + 5);

        nft.mint(lender, tokenId);
        vm.startPrank(lender);
        nft.approve(address(loaner), tokenId);
        uint256 id = loaner.list(address(nft), tokenId, 0.1 ether, 1 ether, maxDays);
        vm.stopPrank();

        activeListingIds.push(id);
    }

    function rentListing(uint8 actorIdx, uint8 listIdx, uint8 daysSeed) external {
        if (activeListingIds.length == 0) return;
        uint256 id = activeListingIds[listIdx % activeListingIds.length];
        Loaner.Listing memory l = loaner.listingOf(id);
        if (l.state != Loaner.State.Available) return;

        address renter = actors[actorIdx % actors.length];
        if (renter == l.lender) return;

        uint16 daysToRent = uint16((uint256(daysSeed) % l.maxDays) + 1);
        uint256 cost = loaner.quote(id, daysToRent);

        vm.prank(renter);
        loaner.rent{value: cost}(id, daysToRent);
    }

    function returnListing(uint8 listIdx) external {
        if (activeListingIds.length == 0) return;
        uint256 id = activeListingIds[listIdx % activeListingIds.length];
        Loaner.Listing memory l = loaner.listingOf(id);
        if (l.state != Loaner.State.Rented) return;
        if (block.timestamp > l.dueAt + loaner.GRACE()) return;

        vm.startPrank(l.renter);
        nft.approve(address(loaner), l.tokenId);
        loaner.giveBack(id);
        vm.stopPrank();
    }

    function claimForfeited(uint8 listIdx) external {
        if (activeListingIds.length == 0) return;
        uint256 id = activeListingIds[listIdx % activeListingIds.length];
        Loaner.Listing memory l = loaner.listingOf(id);
        if (l.state != Loaner.State.Rented) return;
        if (block.timestamp <= l.dueAt + loaner.GRACE()) return;

        vm.prank(l.lender);
        loaner.claimDeposit(id);
    }

    function withdrawPending(uint8 actorIdx) external {
        address actor = actors[actorIdx % actors.length];
        if (loaner.pending(actor) == 0) return;

        vm.prank(actor);
        loaner.withdraw();
    }

    function warpTime(uint32 seconds_) external {
        uint256 jump = (uint256(seconds_) % (15 days)) + 1;
        vm.warp(block.timestamp + jump);
    }
}

contract LoanerInvariantTest is Test {
    Loaner public loaner;
    MockNFT public nft;
    LoanerHandler public handler;

    function setUp() public {
        loaner = new Loaner();
        nft = new MockNFT();
        handler = new LoanerHandler(loaner, nft);

        targetContract(address(handler));
    }

    function invariant_SolvencyBalanceMatchesPendingPlusHeld() public view {
        uint256 sumPending = 0;
        for (uint256 i = 0; i < 3; i++) {
            sumPending += loaner.pending(handler.actors(i));
        }

        uint256 sumHeld = 0;
        uint256 count = loaner.listingCount();
        for (uint256 id = 1; id <= count; id++) {
            Loaner.Listing memory l = loaner.listingOf(id);
            if (l.state == Loaner.State.Rented) {
                sumHeld += l.held;
            }
        }

        assertEq(
            address(loaner).balance,
            sumPending + sumHeld,
            "Solvency invariant: balance must equal pending + held"
        );
    }
}
