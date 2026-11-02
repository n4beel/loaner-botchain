// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Loaner} from "../src/Loaner.sol";
import {MockNFT} from "./helpers/MockNFT.sol";
import {HostileNFT, DeceptiveNFT} from "./helpers/HostileNFT.sol";
import {RejectEther} from "./helpers/RejectEther.sol";

contract LoanerTest is Test {
    Loaner public loaner;
    MockNFT public nft;
    HostileNFT public hostileNft;
    DeceptiveNFT public deceptiveNft;

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xCAFE);

    uint256 public constant TOKEN_ID = 1;
    uint256 public constant TOKEN_ID_2 = 2;
    uint128 public constant PRICE_PER_DAY = 0.5 ether;
    uint128 public constant DEPOSIT = 2.0 ether;
    uint16 public constant MAX_DAYS = 14;

    function setUp() public {
        loaner = new Loaner();
        nft = new MockNFT();
        hostileNft = new HostileNFT();
        deceptiveNft = new DeceptiveNFT();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);

        nft.mint(alice, TOKEN_ID);
        nft.mint(alice, TOKEN_ID_2);
    }

    function test_ListEscrowsToken() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(nft.ownerOf(TOKEN_ID), address(loaner));

        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(l.lender, alice);
        assertEq(l.nft, address(nft));
        assertEq(l.tokenId, TOKEN_ID);
        assertEq(l.pricePerDay, PRICE_PER_DAY);
        assertEq(l.deposit, DEPOSIT);
        assertEq(l.maxDays, MAX_DAYS);
        assertEq(uint8(l.state), uint8(Loaner.State.Available));
    }

    function test_RentPaysExactAndTransfersToken() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 3;
        uint256 expectedPayment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT;

        vm.prank(bob);
        loaner.rent{value: expectedPayment}(id, rentDays);

        assertEq(nft.ownerOf(TOKEN_ID), bob);
        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(l.renter, bob);
        assertEq(l.held, expectedPayment);
        assertEq(uint8(l.state), uint8(Loaner.State.Rented));
        assertEq(l.dueAt, block.timestamp + 3 days);
    }

    function test_RentWrongPaymentReverts() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Loaner.WrongPayment.selector, 3.5 ether));
        loaner.rent{value: 3.0 ether}(id, 3);
    }

    function test_ReturnPaysLenderFeeAndRefundsDeposit() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 2;
        uint256 payment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT; // 1.0 + 2.0 = 3.0 ether

        vm.prank(bob);
        loaner.rent{value: payment}(id, rentDays);

        // Bob approves loaner to return token
        vm.startPrank(bob);
        nft.approve(address(loaner), TOKEN_ID);
        loaner.giveBack(id);
        vm.stopPrank();

        assertEq(nft.ownerOf(TOKEN_ID), address(loaner));
        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(uint8(l.state), uint8(Loaner.State.Available));
        assertEq(l.renter, address(0));
        assertEq(l.held, 0);

        // Fee goes to alice (lender), deposit goes to bob (renter)
        assertEq(loaner.pending(alice), 1.0 ether);
        assertEq(loaner.pending(bob), 2.0 ether);

        // Alice and Bob withdraw
        uint256 alicePre = alice.balance;
        vm.prank(alice);
        loaner.withdraw();
        assertEq(alice.balance, alicePre + 1.0 ether);

        uint256 bobPre = bob.balance;
        vm.prank(bob);
        loaner.withdraw();
        assertEq(bob.balance, bobPre + 2.0 ether);
    }

    function test_ReturnWithoutApprovalReverts_NoStateChange() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 2;
        uint256 payment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT;

        vm.prank(bob);
        loaner.rent{value: payment}(id, rentDays);

        // Bob attempts return without approval
        vm.prank(bob);
        vm.expectRevert("NOT_AUTHORIZED");
        loaner.giveBack(id);

        // State remains Rented
        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(uint8(l.state), uint8(Loaner.State.Rented));
        assertEq(l.renter, bob);
        assertEq(l.held, payment);
        assertEq(loaner.pending(alice), 0);
        assertEq(loaner.pending(bob), 0);
    }

    function test_ReturnAfterGraceReverts() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 2;
        uint256 payment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT;

        vm.prank(bob);
        loaner.rent{value: payment}(id, rentDays);

        // Warp past dueAt (2 days) + GRACE (1 day) + 1 second
        vm.warp(block.timestamp + 3 days + 1);

        vm.startPrank(bob);
        nft.approve(address(loaner), TOKEN_ID);
        vm.expectRevert(Loaner.TooLate.selector);
        loaner.giveBack(id);
        vm.stopPrank();
    }

    function test_ClaimDepositOnlyAfterGrace() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 2;
        uint256 payment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT;

        vm.prank(bob);
        loaner.rent{value: payment}(id, rentDays);

        // During rental period: cannot claim
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Loaner.NotOverdue.selector, block.timestamp + 3 days));
        loaner.claimDeposit(id);

        // During grace period: cannot claim
        vm.warp(block.timestamp + 2 days + 1 hours);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Loaner.NotOverdue.selector, block.timestamp - 1 hours + 1 days));
        loaner.claimDeposit(id);

        // After grace: lender claims full held amount (fee + deposit)
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        loaner.claimDeposit(id);

        assertEq(loaner.pending(alice), payment);
        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(uint8(l.state), uint8(Loaner.State.Settled));
        assertEq(l.held, 0);

        // Token stays with renter (Bob)
        assertEq(nft.ownerOf(TOKEN_ID), bob);
    }

    function test_ClaimDepositOnlyLender() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint16 rentDays = 1;
        uint256 payment = uint256(PRICE_PER_DAY) * rentDays + DEPOSIT;

        vm.prank(bob);
        loaner.rent{value: payment}(id, rentDays);

        vm.warp(block.timestamp + 3 days);

        vm.prank(charlie);
        vm.expectRevert(Loaner.NotLender.selector);
        loaner.claimDeposit(id);
    }

    function test_DelistReturnsToken() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);

        loaner.delist(id);
        vm.stopPrank();

        assertEq(nft.ownerOf(TOKEN_ID), alice);
        Loaner.Listing memory l = loaner.listingOf(id);
        assertEq(uint8(l.state), uint8(Loaner.State.Delisted));
    }

    function test_DelistWhileRentedReverts() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.prank(bob);
        loaner.rent{value: payment}(id, 1);

        vm.prank(alice);
        vm.expectRevert(Loaner.NotAvailable.selector);
        loaner.delist(id);
    }

    function test_LenderCannotRent() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);

        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.expectRevert(Loaner.LenderCannotRent.selector);
        loaner.rent{value: payment}(id, 1);
        vm.stopPrank();
    }

    function test_HostileNftReentrancyBlocked() public {
        hostileNft.mint(alice, TOKEN_ID);
        vm.startPrank(alice);
        hostileNft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(hostileNft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.prank(bob);
        loaner.rent{value: payment}(id, 1);

        // Hostile NFT tries to reenter on transfer
        hostileNft.setAttack(loaner, id);

        vm.startPrank(bob);
        hostileNft.approve(address(loaner), TOKEN_ID);
        vm.expectRevert(Loaner.Reentrancy.selector);
        loaner.giveBack(id);
        vm.stopPrank();
    }

    function test_ReentrantWithdrawBlocked() public {
        RejectEther rejecter = new RejectEther(loaner);
        vm.deal(address(rejecter), 10 ether);

        // Mint and list from rejecter
        nft.mint(address(rejecter), 100);
        vm.prank(address(rejecter));
        nft.approve(address(loaner), 100);

        vm.prank(address(rejecter));
        uint256 id = loaner.list(address(nft), 100, 1 ether, 1 ether, 10);

        // Bob rents it
        vm.prank(bob);
        loaner.rent{value: 2 ether}(id, 1);

        // Bob gives it back
        vm.startPrank(bob);
        nft.approve(address(loaner), 100);
        loaner.giveBack(id);
        vm.stopPrank();

        // Rejecter has 1 ether fee in pending
        assertEq(loaner.pending(address(rejecter)), 1 ether);

        // Rejecter withdraw reverts
        vm.expectRevert(Loaner.WithdrawFailed.selector);
        rejecter.withdraw();
    }

    function test_QuoteMatchesRequirement() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, 0.25 ether, 1.5 ether, 10);
        vm.stopPrank();

        assertEq(loaner.quote(id, 4), 0.25 ether * 4 + 1.5 ether);
    }

    function test_CannotRentAlreadyRented() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.prank(bob);
        loaner.rent{value: payment}(id, 1);

        // Charlie tries to rent already rented token
        vm.prank(charlie);
        vm.expectRevert(Loaner.NotAvailable.selector);
        loaner.rent{value: payment}(id, 1);
    }

    function test_CannotWithdrawTwice() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.prank(bob);
        loaner.rent{value: payment}(id, 1);

        vm.startPrank(bob);
        nft.approve(address(loaner), TOKEN_ID);
        loaner.giveBack(id);
        vm.stopPrank();

        // Alice withdraws her fee
        vm.prank(alice);
        loaner.withdraw();

        // Alice attempts to withdraw a second time
        vm.prank(alice);
        vm.expectRevert(Loaner.NothingToWithdraw.selector);
        loaner.withdraw();
    }

    function test_DelistAlreadyDelistedReverts() public {
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);

        loaner.delist(id);

        vm.expectRevert(Loaner.NotAvailable.selector);
        loaner.delist(id);
        vm.stopPrank();
    }

    function test_ValidationReverts() public {
        // ZeroPrice
        vm.startPrank(alice);
        nft.approve(address(loaner), TOKEN_ID);
        vm.expectRevert(Loaner.ZeroPrice.selector);
        loaner.list(address(nft), TOKEN_ID, 0, DEPOSIT, MAX_DAYS);

        // ZeroDeposit
        vm.expectRevert(Loaner.ZeroDeposit.selector);
        loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, 0, MAX_DAYS);

        // BadDays
        vm.expectRevert(Loaner.BadDays.selector);
        loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, 0);

        vm.expectRevert(Loaner.BadDays.selector);
        loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, 91);

        // NotAContract
        vm.expectRevert(Loaner.NotAContract.selector);
        loaner.list(address(0x1234), 1, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);

        // NotHolder
        nft.mint(bob, 999);
        vm.expectRevert(Loaner.NotHolder.selector);
        loaner.list(address(nft), 999, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);

        // Valid listing
        uint256 id = loaner.list(address(nft), TOKEN_ID, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();

        // Non-existent listing
        vm.prank(bob);
        vm.expectRevert(Loaner.NoSuchListing.selector);
        loaner.rent{value: 1 ether}(999, 1);

        // Rent BadDays
        vm.prank(bob);
        vm.expectRevert(Loaner.BadDays.selector);
        loaner.rent{value: 1 ether}(id, 0);

        vm.prank(bob);
        vm.expectRevert(Loaner.BadDays.selector);
        loaner.rent{value: 1 ether}(id, MAX_DAYS + 1);

        // GiveBack NotRented
        vm.prank(bob);
        vm.expectRevert(Loaner.NotRented.selector);
        loaner.giveBack(id);

        // GiveBack NotRenter
        uint256 payment = uint256(PRICE_PER_DAY) * 1 + DEPOSIT;
        vm.prank(bob);
        loaner.rent{value: payment}(id, 1);

        vm.prank(charlie);
        vm.expectRevert(Loaner.NotRenter.selector);
        loaner.giveBack(id);

        // Delist NotLender
        vm.prank(bob);
        vm.expectRevert(Loaner.NotLender.selector);
        loaner.delist(id);

        // Withdraw NothingToWithdraw
        vm.prank(charlie);
        vm.expectRevert(Loaner.NothingToWithdraw.selector);
        loaner.withdraw();
    }

    function test_DeceptiveNftEscrowReverts() public {
        deceptiveNft.mint(alice, 1);
        deceptiveNft.setFailSilently(true);

        vm.startPrank(alice);
        deceptiveNft.approve(address(loaner), 1);
        vm.expectRevert(Loaner.EscrowFailed.selector);
        loaner.list(address(deceptiveNft), 1, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
        vm.stopPrank();
    }

    function test_LatestPagination() public {
        for (uint256 i = 10; i < 20; i++) {
            nft.mint(alice, i);
            vm.startPrank(alice);
            nft.approve(address(loaner), i);
            loaner.list(address(nft), i, PRICE_PER_DAY, DEPOSIT, MAX_DAYS);
            vm.stopPrank();
        }

        Loaner.Listing[] memory batch = loaner.latest(0, 5);
        assertEq(batch.length, 5);
        assertEq(batch[0].tokenId, 19);

        Loaner.Listing[] memory batch2 = loaner.latest(5, 5);
        assertEq(batch2.length, 5);
        assertEq(batch2[0].tokenId, 14);

        Loaner.Listing[] memory batchEmpty = loaner.latest(20, 5);
        assertEq(batchEmpty.length, 0);
    }

    function testFuzz_Conservation(uint8 rentals) public {
        uint256 n = (uint256(rentals) % 5) + 1;

        for (uint256 i = 1; i <= n; i++) {
            uint256 tId = 500 + i;
            nft.mint(alice, tId);
            vm.startPrank(alice);
            nft.approve(address(loaner), tId);
            uint256 id = loaner.list(address(nft), tId, 0.1 ether, 1 ether, 10);
            vm.stopPrank();

            // Bob rents
            vm.prank(bob);
            loaner.rent{value: 1.1 ether}(id, 1);

            if (i % 2 == 0) {
                // Return
                vm.startPrank(bob);
                nft.approve(address(loaner), tId);
                loaner.giveBack(id);
                vm.stopPrank();
            } else {
                // Claim deposit
                vm.warp(block.timestamp + 3 days);
                vm.prank(alice);
                loaner.claimDeposit(id);
            }
        }

        // Assert balance matches pending balance
        uint256 totalPending = loaner.pending(alice) + loaner.pending(bob);
        assertEq(address(loaner).balance, totalPending);
    }
}
