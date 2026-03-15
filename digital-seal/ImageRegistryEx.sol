// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract ImageRegistry is ERC721URIStorage, ERC2981 {
    uint256 private _nextTokenId;

    struct Record {
        string sha256Hash;
        string watermarkId;
        string parentHash;
        uint256 timestamp;
    }

    // Mapping from tokenId => Record
    mapping(uint256 => Record) public records;

    // Mapping từ parentHash (của ảnh gốc) => mảng tokenId (các ảnh phái sinh)
    // mapping(string => uint256[]) public derivatives;

    event CopyrightMinted(uint256 indexed tokenId, string sha256Hash, address indexed owner);

    constructor() ERC721("TrustLens Copyright", "TLC") {
        _nextTokenId = 1;
        // Mặc định: royalty 5% (500 basis points) gửi về địa chỉ deployer, 
        // nhưng hàm registerCopyright sẽ cho phép customize trên từng NFT.
    }

    /**
     * @dev Đăng ký bản quyền tác phẩm. Mặc định set tiền bản quyền (Royalty)
     *      về địa chỉ `to` với phần trăm `royaltyFraction` (ví dụ 500 = 5%).
     * @param to Địa chỉ nhận NFT và nhận điểm chia tiền bản quyền ERC-2981
     * @param _sha256 Mã băm của bức ảnh
     * @param _watermarkId Mã thủy vân
     * @param _parentHash Cột mốc xác định ảnh phái sinh (nếu rỗng = Tác phẩm gốc)
     * @param _tokenURI Đường dẫn IPFS trỏ đến file metadata JSON
     * @param _royaltyBps Phí bản quyền khi bán lại (Basis Points, 100 = 1%). 
     *        Ví dụ: 500 = 5% trên mỗi giao dịch NFT.
     */
    function registerCopyright(
        address to, 
        string memory _sha256, 
        string memory _watermarkId, 
        string memory _parentHash,
        string memory _tokenURI,
        uint96 _royaltyBps // <-- Thêm trường cấu hình Royalty cho mỗi NFT
    ) public returns (uint256) {
        // Validation (Có thể thêm điều kiện check _sha256 bị trùng lặp)
        
        uint256 tokenId = _nextTokenId++;
        
        // 1. Mint ERC721 Token
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        // 2. Set ERC2981 Royalty Info (Tiền chia hoa hồng tự động trên OpenSea/Blur)
        // Set receiving address to `to` (the creator), mapped per-TokenID
        if (_royaltyBps > 0) {
            _setTokenRoyalty(tokenId, to, _royaltyBps);
        }

        // 3. Save Record to Storage
        records[tokenId] = Record({
            sha256Hash: _sha256,
            watermarkId: _watermarkId,
            parentHash: _parentHash,
            timestamp: block.timestamp
        });

        emit CopyrightMinted(tokenId, _sha256, to);
        return tokenId;
    }

    // --- Utility Views ---
    
    // Tìm kiếm Token ID thông qua mã Hash SHA256 (Mất O(N) Gas vì mapping ngược không có)
    // Cần cẩn thận khi gọi trên Chain vì rất tốn Gas nếu data quá lớn.
    function hashToTokenId(string memory _sha256) public view returns (uint256) {
        for (uint256 i = 1; i < _nextTokenId; i++) {
            if (keccak256(bytes(records[i].sha256Hash)) == keccak256(bytes(_sha256))) {
                return i;
            }
        }
        return 0; // Not found
    }

    // Lấy nguyên cục thông tin bằng Mã SHA thay vì Token ID
    function getRecordByHash(string memory _sha256) public view returns (
        bool exists, 
        address owner, 
        string memory watermarkId, 
        string memory parentHash, 
        uint256 timestamp
    ) {
        uint256 tid = hashToTokenId(_sha256);
        if (tid != 0) {
            Record memory r = records[tid];
            return (true, ownerOf(tid), r.watermarkId, r.parentHash, r.timestamp);
        }
        return (false, address(0), "", "", 0);
    }

    // Check tổng thể xem có record chưa 
    function isRegistered(string memory _sha256) public view returns (bool) {
        return hashToTokenId(_sha256) != 0;
    }

    // --- Overrides required by Solidity due to multiple inheritance ---

    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        virtual 
        override(ERC721URIStorage, ERC2981) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}
