// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * GMC Land Compensation Prototype (Demo)
 *
 * DEMO ONLY – Not production, no legal/financial validity.
 */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GMCLandCompensation is ERC20, Ownable, ReentrancyGuard {
    // -------------------------
    // Land Plot Registry
    // -------------------------

    struct LandPlot {
        string plotId; // e.g. "GT1-4845"
        string dzongkhag; // e.g. "Gelephu"
        string gewog; // e.g. "Gelephu Throm"
        string thram; // e.g. "2583"
        string ownerName; // e.g. "Sonia Ghalay"
        string ownerCid; // e.g. "12008000663"
        string ownType; // e.g. "Family Ownership"
        string majorCategory; // e.g. "Private"
        string landType; // e.g. "Urban Core"
        string plotClass; // e.g. "Urban Core" or "CLASS B"
        uint256 areaAc; // e.g. 0.051 ac * 1e4 = 510
        uint256 allocatedTokens;
        address wallet; // current wallet mapped for this plot
        bool exists;
    }

    // Mapping of plotId to details (public → auto getter)
    mapping(string => LandPlot) public plots;

    // For convenience: list plots tied to a wallet
    mapping(address => string[]) public walletPlots;

    // 🔹 NEW: total ETH earned from selling tokens (per address)
    mapping(address => uint256) public totalProceeds;

    // -------------------------
    // Events
    // -------------------------

    event LandPlotRegistered(
        string indexed plotId,
        address indexed wallet,
        uint256 tokenAmount
    );
    event LandPlotUpdated(string indexed plotId, address indexed newWallet);
    event TokensAllocatedFromPlot(
        string indexed plotId,
        address indexed to,
        uint256 amount
    );

    struct SellOrder {
        uint256 id;
        address seller;
        uint256 amountTotal;
        uint256 amountRemaining;
        uint256 pricePerTokenWei;
        bool active;
    }

    uint256 private nextOrderId = 1;
    mapping(uint256 => SellOrder) public sellOrders;

    event SellOrderCreated(
        uint256 indexed orderId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerTokenWei
    );
    event SellOrderFilled(
        uint256 indexed orderId,
        address indexed buyer,
        uint256 amount,
        uint256 totalPaidWei
    );
    event SellOrderCancelled(
        uint256 indexed orderId,
        address indexed seller,
        uint256 amountReturned
    );

    // -------------------------
    // Constructor
    // -------------------------

    constructor(
        address initialOwner
    ) ERC20("GMC Land Token", "GMCLT") Ownable(initialOwner) {
        // Optional: pre-mint demo supply to owner
        // _mint(initialOwner, 1_000_000 * 1e18);
    }

    // -------------------------
    // Land Plot Functions (ADMIN)
    // -------------------------

    function registerLandPlot(
        string memory plotId,
        string memory dzongkhag,
        string memory gewog,
        string memory thram,
        string memory ownerName,
        string memory ownerCid,
        string memory ownType,
        string memory majorCategory,
        string memory landType,
        string memory plotClass,
        uint256 areaAcTimes1e4,
        address wallet,
        uint256 initialTokenAmount
    ) external onlyOwner {
        require(!plots[plotId].exists, "Plot already exists");
        require(wallet != address(0), "Invalid wallet");

        LandPlot storage lp = plots[plotId];

        lp.plotId = plotId;
        lp.dzongkhag = dzongkhag;
        lp.gewog = gewog;
        lp.thram = thram;
        lp.ownerName = ownerName;
        lp.ownerCid = ownerCid;
        lp.ownType = ownType;
        lp.majorCategory = majorCategory;
        lp.landType = landType;
        lp.plotClass = plotClass;
        lp.areaAc = areaAcTimes1e4;
        lp.wallet = wallet;
        lp.exists = true;

        if (initialTokenAmount > 0) {
            lp.allocatedTokens = initialTokenAmount;
            _mint(wallet, initialTokenAmount);
        }

        walletPlots[wallet].push(plotId);

        emit LandPlotRegistered(plotId, wallet, initialTokenAmount);
    }

    function updatePlotWallet(
        string memory plotId,
        address newWallet
    ) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");

        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");

        lp.wallet = newWallet;
        walletPlots[newWallet].push(plotId);

        emit LandPlotUpdated(plotId, newWallet);
    }

    function allocateTokensFromPlot(
        string memory plotId,
        address toWallet,
        uint256 amount
    ) external onlyOwner {
        require(toWallet != address(0), "Invalid wallet");
        require(amount > 0, "Amount must be > 0");

        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");

        lp.allocatedTokens += amount;
        _mint(toWallet, amount);

        emit TokensAllocatedFromPlot(plotId, toWallet, amount);
    }

    // -------------------------
    // Marketplace: Sell Orders
    // -------------------------

    function createSellOrder(
        uint256 amount,
        uint256 pricePerTokenWei
    ) external nonReentrant returns (uint256 orderId) {
        require(amount > 0, "Amount must be > 0");
        require(pricePerTokenWei > 0, "Price must be > 0");

        _transfer(msg.sender, address(this), amount);

        orderId = nextOrderId;
        nextOrderId++;

        sellOrders[orderId] = SellOrder({
            id: orderId,
            seller: msg.sender,
            amountTotal: amount,
            amountRemaining: amount,
            pricePerTokenWei: pricePerTokenWei,
            active: true
        });

        emit SellOrderCreated(orderId, msg.sender, amount, pricePerTokenWei);
    }

    function buyFromOrder(
        uint256 orderId,
        uint256 amountToBuy
    ) external payable nonReentrant {
        SellOrder storage order = sellOrders[orderId];
        require(order.active, "Order not active");
        require(amountToBuy > 0, "Amount must be > 0");
        require(
            amountToBuy <= order.amountRemaining,
            "Not enough tokens in order"
        );

        // FIX: adjust for decimals (18)
        uint256 totalCost = (amountToBuy * order.pricePerTokenWei) / 1e18;
        require(msg.value >= totalCost, "Insufficient payment");

        order.amountRemaining -= amountToBuy;
        if (order.amountRemaining == 0) {
            order.active = false;
        }

        _transfer(address(this), msg.sender, amountToBuy);

        totalProceeds[order.seller] += totalCost;

        (bool sent, ) = order.seller.call{value: totalCost}("");
        require(sent, "Payment to seller failed");

        uint256 excess = msg.value - totalCost;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "Refund failed");
        }

        emit SellOrderFilled(orderId, msg.sender, amountToBuy, totalCost);
    }

    function cancelSellOrder(uint256 orderId) external nonReentrant {
        SellOrder storage order = sellOrders[orderId];
        require(order.active, "Order not active");
        require(order.seller == msg.sender, "Not your order");

        uint256 remaining = order.amountRemaining;

        order.active = false;
        order.amountRemaining = 0;

        if (remaining > 0) {
            _transfer(address(this), msg.sender, remaining);
        }

        emit SellOrderCancelled(orderId, msg.sender, remaining);
    }

    // -------------------------
    // Admin Mint/Burn
    // -------------------------

    function adminMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function adminBurn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    // -------------------------
    // Receive
    // -------------------------

    receive() external payable {}

    // -------------------------
    // User Dashboard Helper
    // -------------------------

    struct LandPlotView {
        string plotId;
        string dzongkhag;
        string gewog;
        string thram;
        string ownerName;
        string ownerCid;
        string ownType;
        string majorCategory;
        string landType;
        string plotClass;
        uint256 areaAc;
        uint256 allocatedTokens;
        address wallet;
        bool exists;
    }

    function getMyInfo()
        external
        view
        returns (
            uint256 tokenBalance,
            uint256 totalEarned, // 🔹 NEW: total ETH earned from selling
            string[] memory myPlots,
            LandPlotView[] memory fullPlotDetails
        )
    {
        address user = msg.sender;

        // 1. Token balance
        tokenBalance = balanceOf(user);

        // 2. Total ETH earned from sales
        totalEarned = totalProceeds[user];

        // 3. List of plot IDs linked to this wallet
        myPlots = walletPlots[user];

        // 4. Build full plot details array
        fullPlotDetails = new LandPlotView[](myPlots.length);

        for (uint256 i = 0; i < myPlots.length; i++) {
            LandPlot storage p = plots[myPlots[i]];

            fullPlotDetails[i] = LandPlotView({
                plotId: p.plotId,
                dzongkhag: p.dzongkhag,
                gewog: p.gewog,
                thram: p.thram,
                ownerName: p.ownerName,
                ownerCid: p.ownerCid,
                ownType: p.ownType,
                majorCategory: p.majorCategory,
                landType: p.landType,
                plotClass: p.plotClass,
                areaAc: p.areaAc,
                allocatedTokens: p.allocatedTokens,
                wallet: p.wallet,
                exists: p.exists
            });
        }
    }
}
