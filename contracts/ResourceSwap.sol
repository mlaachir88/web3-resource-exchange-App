// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ResourceSwap is ERC721URIStorage, ReentrancyGuard {
    uint256 public constant MAX_OWNED = 4;
    uint256 public constant COOLDOWN = 5 minutes;
    uint256 public constant LOCK_DURATION = 10 minutes;

    uint256 private _nextTokenId = 1;
    uint256 public nextOfferId = 1;

    struct ResourceMeta {
        string name;
        string rtype;
        uint8 tier;
        uint256 value;
        string ipfsUri;
        address[] previousOwners;
        uint256 createdAt;
        uint256 lastTransferAt;
    }

    struct Offer {
        address offerer;
        uint256 offeredTokenId;
        uint256 requestedTokenId;
        bool active;
        uint256 createdAt;
    }

    mapping(uint256 => ResourceMeta) public resources;
    mapping(address => uint256) public ownedCount;
    mapping(address => uint256) public lastActionAt;
    mapping(address => uint256) public lockedUntil;
    mapping(uint256 => Offer) public offers;

    constructor() ERC721("ResourceSwap", "RSWAP") {}

    modifier cooldownOk(address user) {
        require(block.timestamp >= lastActionAt[user] + COOLDOWN, "Cooldown not finished");
        _;
    }

    modifier notLocked(address user) {
        require(block.timestamp >= lockedUntil[user], "User locked");
        _;
    }

    function mintResource(
        string memory _name,
        string memory _rtype,
        uint8 _tier,
        uint256 _value,
        string memory _ipfsUri
    ) external notLocked(msg.sender) cooldownOk(msg.sender) returns (uint256) {
        require(balanceOf(msg.sender) < MAX_OWNED, "Max owned reached");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _ipfsUri);

        ResourceMeta storage m = resources[tokenId];
        m.name = _name;
        m.rtype = _rtype;
        m.tier = _tier;
        m.value = _value;
        m.ipfsUri = _ipfsUri;
        m.createdAt = block.timestamp;
        m.lastTransferAt = block.timestamp;

        lastActionAt[msg.sender] = block.timestamp;
        lockedUntil[msg.sender] = block.timestamp + LOCK_DURATION;

        return tokenId;
    }

    function createOffer(uint256 offeredTokenId, uint256 requestedTokenId)
        external
        notLocked(msg.sender)
        cooldownOk(msg.sender)
        returns (uint256)
    {
        require(ownerOf(offeredTokenId) == msg.sender, "Not owner of offered token");

        require(
            getApproved(offeredTokenId) == address(this) || isApprovedForAll(msg.sender, address(this)),
            "Approve contract first"
        );

        uint256 offerId = nextOfferId++;
        offers[offerId] = Offer({
            offerer: msg.sender,
            offeredTokenId: offeredTokenId,
            requestedTokenId: requestedTokenId,
            active: true,
            createdAt: block.timestamp
        });

        lastActionAt[msg.sender] = block.timestamp;
        return offerId;
    }

    function cancelOffer(uint256 offerId) external {
        Offer storage o = offers[offerId];
        require(o.active, "Offer inactive");
        require(o.offerer == msg.sender, "Not offerer");
        o.active = false;
    }

    function acceptOffer(uint256 offerId)
        external
        nonReentrant
        notLocked(msg.sender)
        cooldownOk(msg.sender)
    {
        Offer storage o = offers[offerId];
        require(o.active, "Offer inactive");

        address offerer = o.offerer;
        uint256 offeredId = o.offeredTokenId;
        uint256 requestedId = o.requestedTokenId;

        require(ownerOf(offeredId) == offerer, "Offerer no longer owner");
        require(ownerOf(requestedId) == msg.sender, "You are not owner of requested token");

        require(
            getApproved(requestedId) == address(this) || isApprovedForAll(msg.sender, address(this)),
            "Approve contract first (acceptor)"
        );

        o.active = false;

        this.safeTransferFrom(offerer, msg.sender, offeredId);
        this.safeTransferFrom(msg.sender, offerer, requestedId);

        lastActionAt[msg.sender] = block.timestamp;
        lockedUntil[msg.sender] = block.timestamp + LOCK_DURATION;

        lastActionAt[offerer] = block.timestamp;
        lockedUntil[offerer] = block.timestamp + LOCK_DURATION;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);

        if (from == address(0) && to != address(0)) {
            ownedCount[to] += 1;
        } else if (from != address(0) && to == address(0)) {
            if (ownedCount[from] > 0) ownedCount[from] -= 1;
        } else if (from != address(0) && to != address(0)) {
            if (ownedCount[from] > 0) ownedCount[from] -= 1;
            ownedCount[to] += 1;
        }

        if (from != address(0) && to != address(0)) {
            resources[tokenId].previousOwners.push(from);
            resources[tokenId].lastTransferAt = block.timestamp;
        }

        return from;
    }

    function tokensOfOwner(address user) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(user);
        uint256[] memory result = new uint256[](balance);

        uint256 idx = 0;
        uint256 maxId = _nextTokenId;
        for (uint256 id = 1; id < maxId; id++) {
            try this.ownerOf(id) returns (address o) {
                if (o == user) {
                    result[idx++] = id;
                    if (idx == balance) break;
                }
            } catch {}
        }

        assembly { mstore(result, idx) }
        return result;
    }
}