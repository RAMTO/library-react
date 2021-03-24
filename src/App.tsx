import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';
import Button from './components/Button';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';

import {
    LIBRARY_ADDRESS
} from './constants';
import { getContract } from './helpers/ethers';
import LIBRARY from './constants/abis/Library.json';

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

interface IAppState {
    fetching: boolean;
    address: string;
    library: any;
    connected: boolean;
    chainId: number;
    pendingRequest: boolean;
    result: any | null;
    libraryContract: any | null;
    info: any | null;
    transactionHash: string | null;
    showTransactionHash: boolean;
    form: any | null;
    allAvailableBooks: IBook[];
    allRentedBooks: IBook[];
    isUserAdmin: boolean;
    showErrorContainer: boolean;
    errorContainer: string;
}

interface IBook {
    id: number;
    name: string;
    copies: number;
    rentable?: boolean;
}

const INITIAL_STATE: IAppState = {
    fetching: false,
    address: '',
    library: null,
    connected: false,
    chainId: 1,
    pendingRequest: false,
    result: null,
    libraryContract: null,
    info: null,
    transactionHash: '',
    showTransactionHash: false,
    form: {
        bookName: "",
        bookCopies: 0,
    },
    allAvailableBooks: [],
    allRentedBooks: [],
    isUserAdmin: false,
    showErrorContainer: false,
    errorContainer: ''
};

class App extends React.Component<any, any> {
    // @ts-ignore
    public web3Modal: Web3Modal;
    public state: IAppState;
    public provider: any;

    constructor(props: any) {
        super(props);
        this.state = {
            ...INITIAL_STATE
        };

        this.web3Modal = new Web3Modal({
            network: this.getNetwork(),
            cacheProvider: true,
            providerOptions: this.getProviderOptions()
        });
    }

    public componentDidMount() {
        if (this.web3Modal.cachedProvider) {
            this.onConnect();
        }
    }

    public onConnect = async () => {
        this.provider = await this.web3Modal.connect();

        const library = new Web3Provider(this.provider);

        const network = await library.getNetwork();

        const address = this.provider.selectedAddress ? this.provider.selectedAddress : this.provider?.accounts[0];

        const libraryContract = getContract(LIBRARY_ADDRESS, LIBRARY.abi, library, address);

        await this.setState({
            library,
            chainId: network.chainId,
            address,
            connected: true,
            libraryContract
        });

        await this.subscribeToProviderEvents(this.provider);

        await this.updateLibrary();
    };

    public subscribeToProviderEvents = async (provider: any) => {
        if (!provider.on) {
            return;
        }

        provider.on("accountsChanged", this.changedAccount);
        provider.on("networkChanged", this.networkChanged);
        provider.on("error", this.handleError);
        provider.on("close", this.close);

        await this.web3Modal.off('accountsChanged');
    };

    public async unSubscribe(provider: any) {
        // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
        window.location.reload(false);
        if (!provider.off) {
            return;
        }

        provider.off("accountsChanged", this.changedAccount);
        provider.off("networkChanged", this.networkChanged);
        provider.off("close", this.close);
    }

    public changedAccount = async (accounts: string[]) => {
        if (!accounts.length) {
            // Metamask Lock fire an empty accounts array
            await this.resetApp();
        } else {
            await this.setState({ address: accounts[0] });
        }

        this.updateLibrary();
    }

    public networkChanged = async (networkId: number) => {
        const library = new Web3Provider(this.provider);
        const network = await library.getNetwork();
        const chainId = network.chainId;
        await this.setState({ chainId, library });
    }

    public close = async () => {
        this.resetApp();
    }

    public getNetwork = () => getChainData(this.state.chainId).network;

    public getProviderOptions = () => {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider,
                options: {
                    infuraId: process.env.REACT_APP_INFURA_ID
                }
            }
        };
        return providerOptions;
    };

    public resetApp = async () => {
        await this.web3Modal.clearCachedProvider();
        localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
        localStorage.removeItem("walletconnect");
        await this.unSubscribe(this.provider);

        this.setState({ ...INITIAL_STATE });
    };

    public submitAddBook = async () => {
        const { libraryContract, allAvailableBooks } = this.state;
        const { bookName, bookCopies } = this.state.form;

        await this.setState({ showErrorContainer: false, errorContainer: "" });

        // Check book name and copies
        const bookAdded = allAvailableBooks.find(book => book.name === bookName.trim());

        if (bookName.trim() === "") {
            await this.setState({ showErrorContainer: true, errorContainer: "Book name should not be empty" });
            return;
        }

        if (bookCopies < 1) {
            await this.setState({ showErrorContainer: true, errorContainer: "Book copies should be > 0" });
            return;
        }

        if (typeof bookAdded !== "undefined") {
            await this.setState({ showErrorContainer: true, errorContainer: "Book already added" });
            return;
        }

        await this.setState({ fetching: true });

        const transaction = await libraryContract.addBook(bookName, parseInt(bookCopies, 10));

        await this.setState({ transactionHash: transaction.hash, showTransactionHash: true });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log(transactionReceipt);
            await this.setState({ showErrorContainer: true, errorContainer: "Failed transaction" });
        }

        await this.setState({ fetching: false, showTransactionHash: false });

        this.getAvailableBooks();
    };

    public borrowBook = async (event: any) => {
        const { libraryContract } = this.state;
        const bookId = event.target.dataset.bookId;

        await this.setState({ fetching: true });

        const transaction = await libraryContract.borrowBook(bookId);

        await this.setState({ transactionHash: transaction.hash, showTransactionHash: true });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log(transactionReceipt);
            await this.setState({ showErrorContainer: true, errorContainer: "Failed transaction" });
        }

        await this.setState({ fetching: false, showTransactionHash: false });

        this.updateLibrary();
    }

    public returnBook = async (event: any) => {
        const { libraryContract } = this.state;
        const bookId = event.target.dataset.bookId;

        await this.setState({ fetching: true });

        const transaction = await libraryContract.returnBook(bookId);

        await this.setState({ transactionHash: transaction.hash, showTransactionHash: true });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log(transactionReceipt);
            await this.setState({ showErrorContainer: true, errorContainer: "Failed transaction" });
        }

        await this.setState({ fetching: false, showTransactionHash: false });

        this.updateLibrary();
    }

    public handleInputChange = async (event: any) => {
        const { name, value } = event.target;
        await this.setState({ form: { ...this.state.form, [name]: value } });
    }

    public getAvailableBooks = async () => {
        const { libraryContract, address } = this.state;

        await this.setState({ fetching: true });

        const allBooksLength = parseInt(await libraryContract.getBooksLength(), 10)

        const allAvailableBooks = []

        for (let i = 0; i < allBooksLength; i++) {
            const bookId = await libraryContract.booksId(i)
            const { name, copies } = await libraryContract.booksInLibrary(bookId)
            const rentable = !await libraryContract.borrowedBooksByUser(address, bookId)
            const book = {
                id: bookId.toString(),
                name,
                copies,
                rentable
            };

            allAvailableBooks.push(book)
        }

        await this.setState({
            allAvailableBooks,
            fetching: false,
        });
    }

    public getBooksByUser = async () => {
        const { libraryContract, address } = this.state;
        await this.setState({ fetching: true });

        const allBooksLength = parseInt(await libraryContract.getBooksLength(), 10)

        const allRentedBooks = []

        for (let i = 0; i < allBooksLength; i++) {
            const bookId = await libraryContract.booksId(i)
            const { name, copies } = await libraryContract.booksInLibrary(bookId)
            const book = {
                id: bookId.toString(),
                name,
                copies
            };

            if (await libraryContract.borrowedBooksByUser(address, bookId)) {
                allRentedBooks.push(book)
            }
        }

        await this.setState({
            allRentedBooks,
            fetching: false
        });
    }

    public renderAvailableBooks = () => {
        const bookRows = this.state.allAvailableBooks.map((b: any, index) => (
            <tr key={index}>
                <td>
                    {b.name}
                </td>
                <td className="text-right">
                    {b.copies}
                </td>
                <td className="text-right">
                    {b.rentable && b.copies > 0 ? <button onClick={this.borrowBook} className="btn btn-sm btn-primary" data-book-id={b.id}>Rent book</button> : <span className="badge badge-warning">Rented</span>}

                </td>
            </tr>
        ));

        return (
            <table className="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th className="text-right">Copies</th>
                        <th className="text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {bookRows}
                </tbody>
            </table>
        );
    }

    public renderRentedBooks = () => {
        const bookRows = this.state.allRentedBooks.map((b: any, index) => (
            <tr key={index}>
                <td>
                    {b.name}
                </td>
                <td className="text-right">
                    <button onClick={this.returnBook} className="btn btn-sm btn-primary" data-book-id={b.id}>Return book</button>
                </td>
            </tr>
        ));

        return (
            <table className="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th className="text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {bookRows}
                </tbody>
            </table>
        );
    }

    public isUserAdmin = async () => {
        const { libraryContract, address } = this.state;
        const owner = await libraryContract.owner();

        await this.setState({
            isUserAdmin: owner.toLowerCase() === address
        });
    }

    public updateLibrary = () => {
        this.setState({ showErrorContainer: false, errorContainer: "" });
        this.isUserAdmin();
        this.getAvailableBooks();
        this.getBooksByUser();
    }

    public handleError = (e: any) => {
        // console.log(e);

    }

    public render = () => {
        const {
            address,
            connected,
            chainId,
            fetching,
            transactionHash,
            showTransactionHash,
            allAvailableBooks,
            allRentedBooks,
            isUserAdmin,
            showErrorContainer,
            errorContainer
        } = this.state;
        return (
            <SLayout>
                <div className="container">
                    <Header
                        connected={connected}
                        address={address}
                        chainId={chainId}
                        killSession={this.resetApp}
                    />
                    <div>
                        {fetching ? (
                            <div>
                                <div>
                                    <Loader />
                                </div>
                                {showTransactionHash && (
                                    <div className="alert alert-info text-left mt-5">
                                        <p>You can view your transaction here: <a target="_blank" href={`https://ropsten.etherscan.io/tx/${transactionHash}`}>{transactionHash}</a></p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div className="text-center py-5">
                                    {!this.state.connected && <ConnectButton onClick={this.onConnect} />}
                                </div>

                                {isUserAdmin ?
                                    <div className="row text-left">
                                        <div className="col-lg-6">
                                            {showErrorContainer &&
                                                <div className="alert alert-danger my-5">
                                                    {errorContainer}
                                                </div>
                                            }
                                            <h4>Add book</h4>

                                            <form action="">
                                                <div className="form-group mt-5">
                                                    <label className="form-label">Book name</label>
                                                    <input value={this.state.form.state} onChange={this.handleInputChange} className="form-control" type="text" name="bookName" />
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Book copies</label>
                                                    <input value={this.state.form.trumpVotes} onChange={this.handleInputChange} className="form-control" type="number" name="bookCopies" />
                                                </div>
                                                <div className="">
                                                    <Button onClick={this.submitAddBook}>Add book</Button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                    :
                                    <div className="alert alert-info">
                                        You can only borrow books
                                    </div>
                                }


                                <div className="row text-left mt-5">
                                    <div className="col-md-6">
                                        <h4>Available books</h4>
                                        {
                                            allAvailableBooks && allAvailableBooks.length > 0 ?
                                                this.renderAvailableBooks() :
                                                <div className="alert alert-warning" role="alert">
                                                    No books available!
                                                </div>
                                        }
                                    </div>

                                    <div className="col-md-6">
                                        <h4>Rented books</h4>
                                        {
                                            allRentedBooks && allRentedBooks.length > 0 ?
                                                this.renderRentedBooks() :
                                                <div className="alert alert-warning" role="alert">
                                                    No books rented!
                                                </div>
                                        }
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </SLayout >
        );
    };
}

export default App;
