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
    // Global Token ↔ Land Value Rate
    // -------------------------
    /**
     * tokensPerUnit:
     * - Simple demo parameter: how many GMCLT tokens are minted
     *   per 1 unit of land value.
     * - You decide what "unit" means off-chain (e.g. Nu / 1,000 Nu / 10,000 Nu).
     */
    uint256 public tokensPerUnit;

    event TokensPerUnitUpdated(uint256 oldRate, uint256 newRate);

    function setTokensPerUnit(uint256 _tokensPerUnit) external onlyOwner {
        require(_tokensPerUnit > 0, "Rate must be > 0");
        uint256 old = tokensPerUnit;
        tokensPerUnit = _tokensPerUnit;
        emit TokensPerUnitUpdated(old, _tokensPerUnit);
    }

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
        // land valuation and derived tokens
        uint256 landValue; // demo: arbitrary "value" unit you decide off-chain
        uint256 allocatedTokens; // total tokens minted for this plot based on landValue
        address wallet; // current registered wallet mapped for this plot
        bool exists;
    }

    // plotId → LandPlot
    mapping(string => LandPlot) public plots;

    // Registered land owner → list of plotIds
    mapping(address => string[]) public walletPlots;

    // -------------------------
    // Plot Indexing (for frontend listing)
    // -------------------------
    // Holds every registered plotId (append-only for demo)
    string[] public allPlotIds;

    // plotId => index+1 in allPlotIds (0 means "not indexed")
    mapping(string => uint256) private plotIndexPlus1;

    // -------------------------
    // Token origin tracking (per user, per plot)
    // -------------------------

    // How many tokens an address currently holds that originated from a given plot
    mapping(address => mapping(string => uint256)) public tokensFromPlot;

    // List of plotIds for which a holder has (or had) tokens – used for iteration
    mapping(address => string[]) private tokenPlots;
    mapping(address => mapping(string => bool)) private hasTokenFromPlot;

    // Total ETH earned from token sales (per address)
    mapping(address => uint256) public totalProceeds;

    // How many tokens a user has bought/sold via the marketplace
    mapping(address => uint256) public tokensBought;
    mapping(address => uint256) public tokensSold;

    // -------------------------
    // Events
    // -------------------------

    event LandPlotRegistered(
        string indexed plotId,
        address indexed wallet,
        uint256 landValue,
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
    // Inheritance / Nominee (Option A - DEMO)
    // -------------------------

    enum InheritanceStatus {
        NONE,
        ACTIVE, // nominee set, owner alive
        DECEASED, // admin confirmed deceased
        CLAIMED // nominee claimed and set new plot wallet
    }

    struct InheritancePlan {
        address nominee;
        InheritanceStatus status;
        uint256 activatedAt;
        uint256 deceasedAt;
        uint256 claimedAt;
    }

    mapping(string => InheritancePlan) public inheritancePlans;

    event NomineeSet(
        string indexed plotId,
        address indexed currentPlotWallet,
        address indexed nominee
    );

    event OwnerDeclaredDeceased(
        string indexed plotId,
        address indexed admin,
        address indexed nominee
    );

    event PlotClaimedByNominee(
        string indexed plotId,
        address indexed nominee,
        address indexed oldWallet,
        address newWallet
    );

    // -------------------------
    // Constructor
    // -------------------------

    constructor(
        address initialOwner
    ) ERC20("GMC Land Token", "GMCLT") Ownable(initialOwner) {
        // Optional: pre-mint demo supply to owner (not tracked per-plot)
        // _mint(initialOwner, 1_000_000 * 1e18);
    }

    // -------------------------
    // Internal helpers for plot-token tracking
    // -------------------------

    function _addTokensFromPlot(
        address account,
        string memory plotId,
        uint256 amount
    ) internal {
        if (amount == 0) return;

        tokensFromPlot[account][plotId] += amount;

        if (!hasTokenFromPlot[account][plotId]) {
            hasTokenFromPlot[account][plotId] = true;
            tokenPlots[account].push(plotId);
        }
    }

    function _moveTokensAcrossPlots(
        address from,
        address to,
        uint256 amount
    ) internal {
        uint256 remaining = amount;
        string[] storage plotsList = tokenPlots[from];

        for (uint256 i = 0; i < plotsList.length && remaining > 0; i++) {
            string memory plotId = plotsList[i];
            uint256 bal = tokensFromPlot[from][plotId];
            if (bal == 0) continue;

            uint256 toMove = bal > remaining ? remaining : bal;

            tokensFromPlot[from][plotId] = bal - toMove;
            _addTokensFromPlot(to, plotId, toMove);

            remaining -= toMove;
        }
        // If remaining > 0, those tokens were never tagged to any plot
        // (e.g. minted via adminMint). They still transfer fine as ERC20.
    }

    // Override ERC20 internal hook to keep per-plot balances in sync on transfers
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0) && value > 0) {
            _moveTokensAcrossPlots(from, to, value);
        }

        super._update(from, to, value);
    }

    /**
     * Set nominee for a plot (must be called by the plot's currently registered wallet).
     */
    function setNomineeForPlot(string memory plotId, address nominee) external {
        require(nominee != address(0), "Invalid nominee");

        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");
        require(msg.sender == lp.wallet, "Only plot wallet");

        InheritancePlan storage plan = inheritancePlans[plotId];

        plan.nominee = nominee;
        plan.status = InheritanceStatus.ACTIVE;
        plan.activatedAt = block.timestamp;
        plan.deceasedAt = 0;
        plan.claimedAt = 0;

        emit NomineeSet(plotId, lp.wallet, nominee);
    }

    /**
     * Admin confirms death (off-chain verification happens BEFORE calling this).
     * After this, nominee can claim and set a new wallet for the plot record.
     */
    function declarePlotOwnerDeceased(string memory plotId) external onlyOwner {
        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");

        InheritancePlan storage plan = inheritancePlans[plotId];
        require(plan.status == InheritanceStatus.ACTIVE, "No active nominee");
        require(plan.nominee != address(0), "Nominee not set");

        plan.status = InheritanceStatus.DECEASED;
        plan.deceasedAt = block.timestamp;

        emit OwnerDeclaredDeceased(plotId, msg.sender, plan.nominee);
    }

    /**
     * Nominee claims plot record and sets a new wallet.
     * This updates lp.wallet and indexes plot under the new wallet.
     * NOTE: This does NOT move ERC20 tokens from the old wallet.
     */
    function claimPlotAsNominee(
        string memory plotId,
        address newWallet
    ) external {
        require(newWallet != address(0), "Invalid new wallet");

        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");

        InheritancePlan storage plan = inheritancePlans[plotId];
        require(plan.status == InheritanceStatus.DECEASED, "Not claimable");
        require(msg.sender == plan.nominee, "Only nominee");

        address oldWallet = lp.wallet;

        // update plot wallet record
        lp.wallet = newWallet;
        walletPlots[newWallet].push(plotId);

        plan.status = InheritanceStatus.CLAIMED;
        plan.claimedAt = block.timestamp;

        emit PlotClaimedByNominee(plotId, msg.sender, oldWallet, newWallet);
    }

    function clearNomineeForPlot(string memory plotId) external {
        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");
        require(msg.sender == lp.wallet, "Only plot wallet");

        InheritancePlan storage plan = inheritancePlans[plotId];
        plan.nominee = address(0);
        plan.status = InheritanceStatus.NONE;
        plan.activatedAt = 0;
        plan.deceasedAt = 0;
        plan.claimedAt = 0;
    }

    /**
     * Nominee claims plot AND transfers plot-tagged tokens to new wallet.
     * - Burns tokensFromPlot[oldWallet][plotId] from old wallet (admin power)
     * - Mints same amount to newWallet
     * - Updates tokensFromPlot mapping
     *
     * NOTE:
     * - This ONLY moves tokens that are currently tagged to this plot in tokensFromPlot.
     * - If old wallet sold tokens, nominee only gets what remains.
     */
    function claimPlotAsNomineeWithTokens(
        string memory plotId,
        address newWallet
    ) external {
        require(newWallet != address(0), "Invalid new wallet");

        LandPlot storage lp = plots[plotId];
        require(lp.exists, "Plot not found");

        InheritancePlan storage plan = inheritancePlans[plotId];
        require(plan.status == InheritanceStatus.DECEASED, "Not claimable");
        require(msg.sender == plan.nominee, "Only nominee");

        address oldWallet = lp.wallet;

        // 1) Transfer the plot-tagged tokens via burn+mint (DEMO admin power)
        uint256 amount = tokensFromPlot[oldWallet][plotId];

        if (amount > 0) {
            // burn from old wallet (requires oldWallet has enough balance)
            _burn(oldWallet, amount);

            // clear old plot-tagged balance
            tokensFromPlot[oldWallet][plotId] = 0;

            // mint to new wallet and tag to plot
            _mint(newWallet, amount);
            _addTokensFromPlot(newWallet, plotId, amount);
        }

        // 2) update plot wallet record + indexing
        lp.wallet = newWallet;
        walletPlots[newWallet].push(plotId);

        plan.status = InheritanceStatus.CLAIMED;
        plan.claimedAt = block.timestamp;

        emit PlotClaimedByNominee(plotId, msg.sender, oldWallet, newWallet);
    }

    // -------------------------
    // Land Plot Functions (ADMIN)
    // -------------------------

    /**
     * Register a land plot and automatically derive tokens
     * from its landValue and the global tokensPerUnit rate.
     *
     * @param landValue demo value (e.g. 1 unit = 1,000 Nu)
     */
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
        uint256 landValue,
        address wallet
    ) external onlyOwner {
        require(!plots[plotId].exists, "Plot already exists");
        require(wallet != address(0), "Invalid wallet");
        require(tokensPerUnit > 0, "Token rate not set");
        require(landValue > 0, "Land value must be > 0");

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

        // index plotId for global listing (append-only)
        if (plotIndexPlus1[plotId] == 0) {
            allPlotIds.push(plotId);
            plotIndexPlus1[plotId] = allPlotIds.length; // store index+1
        }

        // derive tokens from land value
        lp.landValue = landValue;
        uint256 tokenAmount = landValue * tokensPerUnit;
        lp.allocatedTokens = tokenAmount;

        if (tokenAmount > 0) {
            _mint(wallet, tokenAmount);
            _addTokensFromPlot(wallet, plotId, tokenAmount);
        }

        walletPlots[wallet].push(plotId);

        emit LandPlotRegistered(plotId, wallet, landValue, tokenAmount);
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

    /**
     * Optional extra minting from a plot (manual top-up).
     * Still allowed for demo flexibility.
     */
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
        _addTokensFromPlot(toWallet, plotId, amount);

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

        // Simple pricing: totalCost = amountToBuy * pricePerTokenWei / 1e18
        uint256 totalCost = (amountToBuy * order.pricePerTokenWei) / 1e18;
        require(msg.value >= totalCost, "Insufficient payment");

        order.amountRemaining -= amountToBuy;
        if (order.amountRemaining == 0) {
            order.active = false;
        }

        // Transfer tokens from contract to buyer.
        _transfer(address(this), msg.sender, amountToBuy);

        // Track ETH and token volumes
        totalProceeds[order.seller] += totalCost;
        tokensBought[msg.sender] += amountToBuy;
        tokensSold[order.seller] += amountToBuy;

        // Pay seller
        (bool sent, ) = order.seller.call{value: totalCost}("");
        require(sent, "Payment to seller failed");

        // Refund any excess ETH
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
    // NOTE: Tokens minted here are NOT tagged to any plot.

    function adminMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        // not tagged to any plot on purpose
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

    function getWalletPlots(
        address wallet
    ) external view returns (string[] memory) {
        return walletPlots[wallet];
    }

    // ✅ New getters for global plot listing
    function getAllPlotIds() external view returns (string[] memory) {
        return allPlotIds;
    }

    function getPlotCount() external view returns (uint256) {
        return allPlotIds.length;
    }

    function getPlotIdAt(uint256 index) external view returns (string memory) {
        require(index < allPlotIds.length, "Index out of bounds");
        return allPlotIds[index];
    }

    function isPlotIndexed(string memory plotId) external view returns (bool) {
        return plotIndexPlus1[plotId] != 0;
    }

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
        uint256 landValue;
        uint256 allocatedTokens; // total minted for this plot (all holders)
        uint256 myTokensFromThisPlot; // how many tokens caller (or user) currently holds from this plot
        address wallet; // registered land wallet
        bool exists;
    }

    function getMyInfo()
        external
        view
        returns (
            uint256 tokenBalance,
            uint256 totalEarned,
            uint256 totalTokensBought,
            uint256 totalTokensSold,
            string[] memory myPlots,
            LandPlotView[] memory fullPlotDetails
        )
    {
        address user = msg.sender;

        tokenBalance = balanceOf(user);
        totalEarned = totalProceeds[user];
        totalTokensBought = tokensBought[user];
        totalTokensSold = tokensSold[user];

        string[] storage allPlots = tokenPlots[user];

        uint256 count = 0;
        for (uint256 i = 0; i < allPlots.length; i++) {
            string memory pid = allPlots[i];
            if (tokensFromPlot[user][pid] > 0) {
                count++;
            }
        }

        myPlots = new string[](count);
        fullPlotDetails = new LandPlotView[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < allPlots.length; i++) {
            string memory pid = allPlots[i];
            uint256 myBalFromPlot = tokensFromPlot[user][pid];
            if (myBalFromPlot == 0) continue;

            LandPlot storage p = plots[pid];

            myPlots[idx] = pid;
            fullPlotDetails[idx] = LandPlotView({
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
                landValue: p.landValue,
                allocatedTokens: p.allocatedTokens,
                myTokensFromThisPlot: myBalFromPlot,
                wallet: p.wallet,
                exists: p.exists
            });

            idx++;
        }
    }

    function getUserPlotBreakdown(
        address user
    )
        external
        view
        returns (
            uint256 tokenBalance,
            uint256 totalEarned,
            uint256 totalTokensBought,
            uint256 totalTokensSold,
            string[] memory plotIds,
            LandPlotView[] memory plotDetails
        )
    {
        tokenBalance = balanceOf(user);
        totalEarned = totalProceeds[user];
        totalTokensBought = tokensBought[user];
        totalTokensSold = tokensSold[user];

        string[] storage allPlots = tokenPlots[user];

        uint256 count = 0;
        for (uint256 i = 0; i < allPlots.length; i++) {
            string memory pid = allPlots[i];
            if (tokensFromPlot[user][pid] > 0) {
                count++;
            }
        }

        plotIds = new string[](count);
        plotDetails = new LandPlotView[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < allPlots.length; i++) {
            string memory pid = allPlots[i];
            uint256 myBalFromPlot = tokensFromPlot[user][pid];
            if (myBalFromPlot == 0) continue;

            LandPlot storage p = plots[pid];

            plotIds[idx] = pid;
            plotDetails[idx] = LandPlotView({
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
                landValue: p.landValue,
                allocatedTokens: p.allocatedTokens,
                myTokensFromThisPlot: myBalFromPlot,
                wallet: p.wallet,
                exists: p.exists
            });

            idx++;
        }
    }

    function getAllPlotsForAdmin()
        external
        view
        returns (LandPlotView[] memory)
    {
        uint256 count = allPlotIds.length;
        LandPlotView[] memory result = new LandPlotView[](count);

        for (uint256 i = 0; i < count; i++) {
            string memory pid = allPlotIds[i];
            LandPlot storage p = plots[pid];

            result[i] = LandPlotView({
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
                landValue: p.landValue,
                allocatedTokens: p.allocatedTokens,
                myTokensFromThisPlot: 0, // admin context
                wallet: p.wallet,
                exists: p.exists
            });
        }

        return result;
    }
}
