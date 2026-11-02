// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

contract Loaner {
    enum State {
        Available,
        Rented,
        Delisted,
        Settled
    }

    struct Listing {
        address lender;
        address nft;
        uint256 tokenId;
        uint128 pricePerDay;
        uint128 deposit;
        uint16 maxDays;
        State state;
        address renter;
        uint64 dueAt;
        uint128 held;
    }

    uint64 public constant GRACE = 1 days;
    uint16 public constant MIN_DAYS = 1;
    uint16 public constant MAX_DAYS = 90;
    uint256 public constant MAX_BATCH = 50;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) public pending;
    uint256 public listingCount;

    event Listed(
        uint256 indexed id,
        address indexed lender,
        address indexed nft,
        uint256 tokenId,
        uint128 pricePerDay,
        uint128 deposit,
        uint16 maxDays
    );
    event Rented(
        uint256 indexed id,
        address indexed renter,
        uint16 days_,
        uint64 dueAt,
        uint256 paid
    );
    event Returned(uint256 indexed id);
    event Forfeited(uint256 indexed id, uint128 amount);
    event Delisted(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAContract();
    error ZeroPrice();
    error ZeroDeposit();
    error BadDays();
    error NotHolder();
    error EscrowFailed();
    error NoSuchListing();
    error NotAvailable();
    error LenderCannotRent();
    error WrongPayment(uint256 expected);
    error NotRenter();
    error NotRented();
    error TooLate();
    error NotReturned();
    error NotLender();
    error NotOverdue(uint64 readyAt);
    error NothingToWithdraw();
    error WithdrawFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    function list(
        address nft,
        uint256 tokenId,
        uint128 pricePerDay,
        uint128 deposit,
        uint16 maxDays
    ) external nonReentrant returns (uint256 id) {
        if (nft.code.length == 0) revert NotAContract();
        if (pricePerDay == 0) revert ZeroPrice();
        if (deposit == 0) revert ZeroDeposit();
        if (maxDays < MIN_DAYS || maxDays > MAX_DAYS) revert BadDays();

        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotHolder();

        // Increment ID first (IDs start at 1)
        id = ++listingCount;

        _listings[id] = Listing({
            lender: msg.sender,
            nft: nft,
            tokenId: tokenId,
            pricePerDay: pricePerDay,
            deposit: deposit,
            maxDays: maxDays,
            state: State.Available,
            renter: address(0),
            dueAt: 0,
            held: 0
        });

        // Escrow token into this contract
        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
        if (IERC721(nft).ownerOf(tokenId) != address(this)) revert EscrowFailed();

        emit Listed(id, msg.sender, nft, tokenId, pricePerDay, deposit, maxDays);
    }

    function rent(uint256 id, uint16 days_) external payable nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];

        if (l.state != State.Available) revert NotAvailable();
        if (days_ < MIN_DAYS || days_ > l.maxDays) revert BadDays();
        if (msg.sender == l.lender) revert LenderCannotRent();

        uint256 expectedPayment = uint256(l.pricePerDay) * days_ + l.deposit;
        if (msg.value != expectedPayment) revert WrongPayment(expectedPayment);

        uint64 dueAt = uint64(block.timestamp + uint256(days_) * 1 days);

        // State changes before external call
        l.state = State.Rented;
        l.renter = msg.sender;
        l.dueAt = dueAt;
        l.held = uint128(msg.value);

        // Transfer token from contract to renter
        IERC721(l.nft).transferFrom(address(this), msg.sender, l.tokenId);

        emit Rented(id, msg.sender, days_, dueAt, msg.value);
    }

    function giveBack(uint256 id) external nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];

        if (l.state != State.Rented) revert NotRented();
        if (msg.sender != l.renter) revert NotRenter();
        if (block.timestamp > l.dueAt + GRACE) revert TooLate();

        uint128 fee = l.held - l.deposit;
        uint128 dep = l.deposit;

        // Effects first
        pending[l.lender] += fee;
        pending[l.renter] += dep;

        l.held = 0;
        l.renter = address(0);
        l.dueAt = 0;
        l.state = State.Available;

        // Interactions: pull token back to contract
        IERC721(l.nft).transferFrom(msg.sender, address(this), l.tokenId);
        if (IERC721(l.nft).ownerOf(l.tokenId) != address(this)) revert NotReturned();

        emit Returned(id);
    }

    function claimDeposit(uint256 id) external nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];

        if (msg.sender != l.lender) revert NotLender();
        if (l.state != State.Rented) revert NotRented();

        uint64 readyAt = l.dueAt + GRACE;
        if (block.timestamp <= readyAt) revert NotOverdue(readyAt);

        uint128 amount = l.held;
        l.held = 0;
        pending[l.lender] += amount;
        l.state = State.Settled;

        emit Forfeited(id, amount);
    }

    function delist(uint256 id) external nonReentrant {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];

        if (msg.sender != l.lender) revert NotLender();
        if (l.state != State.Available) revert NotAvailable();

        l.state = State.Delisted;

        // Return token to lender
        IERC721(l.nft).transferFrom(address(this), msg.sender, l.tokenId);

        emit Delisted(id);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert WithdrawFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function listingOf(uint256 id) external view returns (Listing memory) {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        return _listings[id];
    }

    function quote(uint256 id, uint16 days_) external view returns (uint256) {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];
        return uint256(l.pricePerDay) * days_ + l.deposit;
    }

    function renterOf(uint256 id) external view returns (address) {
        if (id == 0 || id > listingCount) revert NoSuchListing();
        Listing storage l = _listings[id];
        return l.state == State.Rented ? l.renter : address(0);
    }

    function latest(
        uint256 offset,
        uint256 count
    ) external view returns (Listing[] memory) {
        if (offset >= listingCount) return new Listing[](0);
        if (count > MAX_BATCH) count = MAX_BATCH;

        uint256 remaining = listingCount - offset;
        uint256 batchSize = count < remaining ? count : remaining;
        Listing[] memory result = new Listing[](batchSize);

        // Newest first: from listingCount - offset down to 1
        for (uint256 i = 0; i < batchSize; i++) {
            uint256 targetId = listingCount - offset - i;
            result[i] = _listings[targetId];
        }

        return result;
    }
}
